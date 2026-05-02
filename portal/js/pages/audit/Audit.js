/**
 * Audit Events Page - Timeline view of all audit events
 */

import { api } from '@api';
import { orgContext } from '@orgContext';
import { auth } from '@auth';
import toast from '@toast';
import { logger } from '@config';
import { getEffectiveMaxInputDate } from '../../utils/effectiveDate.js';
import { 
    getBaseType, 
    getEventName, 
    isNotificationEvent, 
    getTypeKey, 
    getTypeLabel,
    getEventIcon,
    getEventColorClass
} from './utils/AuditEventUtils.js';
import { 
    applyFilters, 
    getUniqueEventTypes, 
    groupEventsByType, 
    groupEventsByDate 
} from './utils/AuditFilterService.js';
import { 
    calculateEventsByType, 
    calculateEventsOverTime, 
    calculateTopUsers, 
    calculateTopDevices,
    calculateSummaryStats
} from './services/AuditAnalyticsService.js';

const { html } = window;
const { useState, useEffect, useRef } = window.preactHooks;

// Chart instance at module level to persist across component renders
let auditChartInstance = null;

// Cache helper functions for SWR pattern
const getCachedAuditData = (key, ttlMinutes = 30) => {
    try {
        const cached = localStorage.getItem(key);
        if (!cached) return null;

        const { data, timestamp } = JSON.parse(cached);
        const ageMs = Date.now() - timestamp;
        const TTL_MS = ttlMinutes * 60 * 1000;
        const isStale = ageMs >= TTL_MS;

        if (isStale) {
            logger.debug(`[Audit] Cache HIT (STALE): ${key} (age: ${Math.round(ageMs / 1000)}s, ttl: ${ttlMinutes}m)`);
        } else {
            logger.debug(`[Audit] Cache HIT (FRESH): ${key} (age: ${Math.round(ageMs / 1000)}s)`);
        }
        return { data, isStale };
    } catch (err) {
        console.warn('[Audit] Cache read error:', err);
    }
    return null;
};

const getActorLabel = (evt, isSiteAdmin = false) => {
    const currentUser = auth.getUser();
    const isCurrentUserSiteAdmin = isSiteAdmin || currentUser?.userType === 'SiteAdmin';
    const label = evt?.performedByDisplay || evt?.performedBy || 'System';
    
    // If current user is not a SiteAdmin and the performer is a SiteAdmin (has @ indicating email)
    if (!isCurrentUserSiteAdmin && label && label.includes('@')) {
        // This is likely a SiteAdmin email; show 'SiteAdmin' instead for privacy
        return 'SiteAdmin';
    }
    return label;
};

const setCachedAuditData = (key, data) => {
    try {
        localStorage.setItem(key, JSON.stringify({
            data,
            timestamp: Date.now()
        }));
        logger.debug(`[Audit] Cache SAVE: ${key}`);
    } catch (err) {
        console.warn('[Audit] Cache write error:', err);
    }
};

export function AuditPage() {
    logger.debug('[Audit] Component rendering...');

    const currentUser = auth.getUser();
    const isSiteAdmin = currentUser?.userType === 'SiteAdmin';
    const currentOrg = orgContext.getCurrentOrg();
    const showTimelineTab = isSiteAdmin || currentOrg?.type !== 'Personal';

    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [isRefreshingInBackground, setIsRefreshingInBackground] = useState(false);
    const scrollObserverRef = useRef(null);
    const nextPageTokenRef = useRef(null);
    const [activeTab, setActiveTab] = useState('analytics'); // 'analytics', 'timeline', 'user-activity', or 'device-activity'
    const [events, setEvents] = useState([]);
    const [uxSummary, setUxSummary] = useState(null);
    const [filteredEvents, setFilteredEvents] = useState([]);
    const [creditJobEvents, setCreditJobEvents] = useState([]);
    const [analytics, setAnalytics] = useState(null);
    const [loadingAnalytics, setLoadingAnalytics] = useState(false);
    const [filters, setFilters] = useState({
        eventType: 'all',
        search: '',
        dateFrom: '',
        dateTo: ''
    });
    const [rangeDays, setRangeDays] = useState(7); // Default to 7 days
    const [loadedPages, setLoadedPages] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const currentOrgId = orgContext.getCurrentOrg()?.orgId;
    const maxSelectableDate = getEffectiveMaxInputDate();

    useEffect(() => {
        loadEvents();

        const handler = () => {
            setLoadedPages(1);
            nextPageTokenRef.current = null;
            loadEvents(true);
        };
        const unsubscribe = orgContext.onChange(handler);
        window.addEventListener('orgChanged', handler);

        // Re-fetch when Time Warp activates / deactivates
        const unsubscribeWarp = window.rewindContext?.onChange?.(() => {
            setLoadedPages(1);
            nextPageTokenRef.current = null;
            loadEvents(true);
        });

        return () => {
            unsubscribe?.();
            unsubscribeWarp?.();
            window.removeEventListener('orgChanged', handler);
        };
    }, [currentOrgId, rangeDays]);
    
    // Infinite scroll observer (auto-load next page)
    useEffect(() => {
        if (activeTab !== 'timeline') return;
        const observerTarget = scrollObserverRef.current;
        if (!observerTarget) return;

        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting && !loading && !loadingMore && hasMore) {
                    loadNextPage();
                }
            },
            { threshold: 0, rootMargin: '300px 0px' }
        );

        observer.observe(observerTarget);
        return () => observer.disconnect();
    }, [activeTab, hasMore, loading, loadingMore, currentOrgId, rangeDays, filteredEvents.length]);

    useEffect(() => {
        if (activeTab === 'analytics' && analytics) {
            renderAllCharts(analytics);
        }
    }, [analytics, activeTab]);

    useEffect(() => {
        if (!showTimelineTab && activeTab === 'timeline') {
            setActiveTab('analytics');
        }
    }, [showTimelineTab, activeTab]);

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
            requestAnimationFrame(() => renderCreditJobChart(jobEvents));
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
                            label: function (context) {
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
                            callback: function (value) {
                                if (value === 0) return 'Failed';
                                if (value === 1) return 'Started';
                                if (value === 2) return 'Completed';
                                return '';
                            }
                        },
                        grid: {
                            color: getComputedStyle(document.body).getPropertyValue('--tblr-border-color').trim() || 'rgba(0,0,0,0.05)'
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

    const toNumber = (value) => {
        if (value === null || value === undefined) return 0;
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string') {
            const parsed = parseFloat(value);
            return Number.isFinite(parsed) ? parsed : 0;
        }
        if (typeof value === 'object') {
            if (value.value !== undefined) {
                const parsed = parseFloat(value.value);
                return Number.isFinite(parsed) ? parsed : 0;
            }
            if (value.Value !== undefined) {
                const parsed = parseFloat(value.Value);
                return Number.isFinite(parsed) ? parsed : 0;
            }
        }
        return 0;
    };

    const humanize = (value) => {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/_/g, ' ')
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/\s+/g, ' ')
            .trim();
    };

    const toLocalDayKey = (value) => {
        const d = value instanceof Date ? value : new Date(value);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    const parseLocalDayKey = (dayKey) => {
        const [y, m, d] = String(dayKey).split('-').map(Number);
        return new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
    };

    const buildDateRange = (days) => {
        const dates = [];
        const end = new Date();
        end.setHours(23, 59, 59, 999);

        const start = new Date(end);
        start.setDate(start.getDate() - (Math.max(1, days) - 1));
        start.setHours(0, 0, 0, 0);

        const cursor = new Date(start);
        while (cursor <= end) {
            dates.push(toLocalDayKey(cursor));
            cursor.setDate(cursor.getDate() + 1);
        }

        return { dates, start, end };
    };

    const groupByDayAndType = (events = []) => {
        const map = {};
        const types = new Set();
        const { dates, start, end } = buildDateRange(rangeDays);

        events.forEach(evt => {
            if (!evt.eventType) return;
            const ts = new Date(evt.timestamp);
            if (ts < start || ts > end) return;
            const dayKey = toLocalDayKey(ts);
            const type = getTypeKey(evt);
            types.add(type);
            const perDay = map[dayKey] ?? {};
            perDay[type] = (perDay[type] ?? 0) + 1;
            map[dayKey] = perDay;
        });

        const typeList = Array.from(types).sort();
        const palette = [
            'rgba(32, 107, 196, 0.8)',
            'rgba(40, 167, 69, 0.8)',
            'rgba(214, 57, 57, 0.8)',
            'rgba(245, 159, 0, 0.8)',
            'rgba(23, 162, 184, 0.8)',
            'rgba(156, 39, 176, 0.8)',
            'rgba(0, 123, 255, 0.8)',
            'rgba(255, 193, 7, 0.8)'
        ];

        const series = typeList.map((type, idx) => ({
            label: type.replace(':', ' • '),
            data: dates.map(d => map[d]?.[type] ?? 0),
            backgroundColor: palette[idx % palette.length]
        }));

        return { dates, series, types: typeList };
    };

    const groupByDayCustom = (events = [], keySelector, labelSelector) => {
        const map = {};
        const types = new Set();
        const labels = {};
        const { dates, start, end } = buildDateRange(rangeDays);

        events.forEach(evt => {
            const ts = new Date(evt.timestamp);
            if (ts < start || ts > end) return;
            const dayKey = toLocalDayKey(ts);
            const type = keySelector(evt);
            if (!type) return;
            const label = labelSelector(evt) || type;
            labels[type] = label;
            types.add(type);
            const perDay = map[dayKey] ?? {};
            perDay[type] = (perDay[type] ?? 0) + 1;
            map[dayKey] = perDay;
        });

        const typeList = Array.from(types).sort();
        const palette = [
            'rgba(32, 107, 196, 0.8)',
            'rgba(40, 167, 69, 0.8)',
            'rgba(214, 57, 57, 0.8)',
            'rgba(245, 159, 0, 0.8)',
            'rgba(23, 162, 184, 0.8)',
            'rgba(156, 39, 176, 0.8)',
            'rgba(0, 123, 255, 0.8)',
            'rgba(255, 193, 7, 0.8)'
        ];

        const series = typeList.map((type, idx) => ({
            label: labels[type]?.replace(':', ' • ') ?? type.replace(':', ' • '),
            data: dates.map(d => map[d]?.[type] ?? 0),
            backgroundColor: palette[idx % palette.length]
        }));

        return { dates, series, types: typeList };
    };

    const classifyLifecycleCategory = (evt) => {
        const raw = getEventName(evt).toLowerCase();
        const target = (evt?.targetType || '').toLowerCase();
        if (isNotificationEvent(evt)) return null;
        if (raw.includes('device') || target === 'device') return 'Device';
        if (raw.startsWith('org') || raw.startsWith('personalorg')) return 'Org';
        if (raw.startsWith('orgmember') || raw.includes('memberadded') || raw.includes('memberremoved') || raw.includes('memberrole')) return 'Org';
        if ((target === 'org' || target === 'organization') && raw.includes('org')) return 'Org';
        // Exclude license from lifecycle chart (credit events go to credit consumption chart)
        // Config changes are system events, not lifecycle
        // ResponseCommand events are operational, not lifecycle
        return null;
    };

    const deriveLifecycleSubType = (evt, category) => {
        const metaSub = evt?.subType || evt?.metadata?.subType || evt?.metadata?.SubType;
        if (metaSub) {
            const humanized = humanize(metaSub);
            // Apply proper casing: capitalize first letter, lowercase rest (except acronyms)
            if (humanized.length > 0) {
                return humanized.charAt(0).toUpperCase() + humanized.slice(1).toLowerCase();
            }
            return humanized;
        }

        const raw = getEventName(evt);

        // Normalize common lifecycle event names to user-friendly legend labels.
        const lowerRaw = raw.toLowerCase();
        if (lowerRaw.includes('registered') || lowerRaw.includes('created') || lowerRaw.includes('added')) return 'Created';
        if (lowerRaw.includes('updated') || lowerRaw.includes('modified') || lowerRaw.includes('changed')) return 'Updated';
        if (lowerRaw.includes('deleted') || lowerRaw.includes('removed')) return 'Deleted';
        if (lowerRaw.includes('disabled') || lowerRaw.includes('blocked')) return 'Disabled';
        if (lowerRaw.includes('enabled') || lowerRaw.includes('unblocked')) return 'Enabled';

        if (category && raw.toLowerCase().startsWith(category.toLowerCase())) {
            const remainder = raw.substring(category.length).replace(/^[:\.\-_\s]+/, '');
            return humanize(remainder || 'Event');
        }

        const metaType = evt?.metadata?.eventType || evt?.metadata?.EventType;
        if (metaType) return humanize(metaType);

        return '';
    };

    const groupLifecycleEvents = (events = []) => {
        const scoped = events
            .map(evt => {
                const category = classifyLifecycleCategory(evt);
                if (!category) return null;
                const sub = deriveLifecycleSubType(evt, category);
                const key = sub ? `${category}:${sub}` : category;
                const label = sub ? `${category} • ${sub}` : category;
                return { ...evt, __groupKey: key, __groupLabel: label };
            })
            .filter(Boolean);

        return groupByDayCustom(
            scoped,
            (e) => e.__groupKey,
            (e) => e.__groupLabel
        );
    };

    const groupLoginEvents = (events = []) => {
        const scoped = events.map(evt => {
            const rawType = (evt?.eventType || '').toLowerCase();
            const rawSub = (evt?.subType || evt?.metadata?.subType || evt?.metadata?.SubType || '').toLowerCase();
            const isFailure = rawType.includes('fail') || rawSub.includes('fail');
            const outcome = isFailure ? 'Failure' : humanize(evt?.subType || evt?.metadata?.subType || evt?.metadata?.SubType || 'Success');
            // Card title already conveys "Login Timeline", so the legend
            // shows just the outcome (e.g. "User Login", "Failure") without
            // a redundant "Login • " prefix.
            const key = `Login:${outcome}`;
            const label = outcome;
            return { ...evt, __groupKey: key, __groupLabel: label };
        });

        return groupByDayCustom(
            scoped,
            (e) => e.__groupKey,
            (e) => e.__groupLabel
        );
    };

    const computeUserSessions = (allEvents = []) => {
        // Group events by user (performedBy)
        const eventsByUser = {};
        allEvents.forEach(evt => {
            const user = evt.performedBy || 'System';
            if (!eventsByUser[user]) {
                eventsByUser[user] = [];
            }
            eventsByUser[user].push(evt);
        });

        // For each user, group consecutive events within 10 minutes into sessions
        const sessionsByUser = {};
        const TEN_MINUTES = 10 * 60 * 1000; // 10 minutes in milliseconds

        Object.entries(eventsByUser).forEach(([user, events]) => {
            const sorted = events.slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            const sessions = [];
            let currentSession = null;

            sorted.forEach(evt => {
                const timestamp = new Date(evt.timestamp);
                if (!currentSession) {
                    currentSession = {
                        user,
                        startTime: timestamp,
                        endTime: timestamp,
                        eventCount: 1,
                        events: [evt]
                    };
                } else {
                    const timeSinceLastEvent = timestamp - currentSession.endTime;
                    if (timeSinceLastEvent <= TEN_MINUTES) {
                        // Same session: extend end time
                        currentSession.endTime = timestamp;
                        currentSession.eventCount += 1;
                        currentSession.events.push(evt);
                    } else {
                        // New session
                        sessions.push(currentSession);
                        currentSession = {
                            user,
                            startTime: timestamp,
                            endTime: timestamp,
                            eventCount: 1,
                            events: [evt]
                        };
                    }
                }
            });

            if (currentSession) {
                sessions.push(currentSession);
            }

            sessionsByUser[user] = sessions;
        });

        return sessionsByUser;
    };

    const buildUserSessionsFromAccessSummary = (accessSummary) => {
        const sessions = accessSummary?.sessions || [];
        if (!Array.isArray(sessions) || sessions.length === 0) {
            return null;
        }

        const grouped = {};
        sessions.forEach(s => {
            // actor is the group key; actorDisplay/actorRole/actorEmail come from the enriched backend.
            const groupKey = s.actor || 'Unknown';
            if (!grouped[groupKey]) grouped[groupKey] = [];

            const actorDisplay = s.actorDisplay || groupKey;
            const actorEmail = s.actorEmail || null;

            const start = new Date(s.startUtc || s.startTime || s.start);
            const end   = new Date(s.endUtc   || s.endTime  || s.end);
            grouped[groupKey].push({
                user:         groupKey,
                actorDisplay,
                actorRole:    s.actorRole    || 'Unknown',
                actorEmail,
                startTime:    start,
                endTime:      end,
                eventCount:   Number(s.eventCount || 0),
                events:       []
            });
        });

        return grouped;
    };

    const computeAnalytics = (allEvents = [], uxSummary = null) => {
        const includesAny = (evt, keys = []) => {
            const combo = `${evt.eventType ?? ''} ${evt.subType ?? ''}`.toLowerCase();
            return keys.some(k => combo.includes(k.toLowerCase()));
        };

        // Credit events: consumption + adjustments (LicenseAdjustment includes seat/credit changes)
        const creditEvents = allEvents
            .filter(e => includesAny(e, ['credit', 'licenseadjustment', 'licensecreated', 'licensecreditsadded', 'creditconsumptioncalculated', 'licenseexpired', 'licensecreditslow', 'licenseexpiringsoon']))
            .slice()
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        const creditDataPoints = creditEvents.map(evt => {
            const meta = evt.metadata || {};
            const eventType = evt.eventType || '';

            // Handle LicenseAdjustment: use newRemainingCredits and creditsDiff
            if (eventType.toLowerCase() === 'licenseadjustment') {
                return {
                    timestamp: evt.timestamp,
                    eventType: getTypeLabel(evt),
                    reason: meta.reason || 'License adjustment',
                    remaining: toNumber(meta.newRemainingCredits ?? meta.remainingCredits),
                    consumed: toNumber(meta.creditsDiff ?? meta.creditsConsumed ?? 0),
                    added: meta.creditsDiff > 0 ? toNumber(meta.creditsDiff) : 0,
                    seats: toNumber(meta.newSeats ?? meta.seats ?? 1),
                    isAdjustment: true
                };
            }

            // Handle CreditConsumption: use remainingCredits and creditsConsumed (negative)
            return {
                timestamp: evt.timestamp,
                eventType: getTypeLabel(evt),
                remaining: toNumber(meta.remainingCredits),
                consumed: -toNumber(meta.creditsConsumed ?? 0), // Negative for consumption
                added: 0,
                seats: toNumber(meta.seats ?? 1),
                isAdjustment: false
            };
        });

        // License adjustments (seats, credits): extract key state transitions
        const licenseAdjustmentEvents = allEvents
            .filter(e => includesAny(e, ['licenseadjustment']))
            .map(evt => ({
                timestamp: evt.timestamp,
                eventType: evt.eventType,
                performedBy: evt.performedBy,
                description: evt.description,
                metadata: evt.metadata
            }))
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // Newest first

        // AI reports: track report generation by model
        const aiReports = allEvents
            .filter(e => includesAny(e, ['ai_report', 'report_generated']))
            .map(evt => ({
                timestamp: evt.timestamp,
                model: evt.subType || evt.metadata?.Model || 'unknown',
                riskScore: toNumber(evt.metadata?.RiskScore),
                deviceCount: toNumber(evt.metadata?.DeviceCount),
                criticalVulns: toNumber(evt.metadata?.CriticalVulns),
                highVulns: toNumber(evt.metadata?.HighVulns)
            }))
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        const emailEvents = allEvents
            .filter(e => includesAny(e, ['email', 'notification']))
            .map(e => {
                const meta = e.metadata || {};
                // Resolve the most specific email kind we can find. Strip a
                // redundant "EMAIL." or "Email." prefix and any duplicate
                // ":SubType" suffix so the chart legend doesn't read
                // "EMAIL.EmailSent:EmailSent". Card title already says
                // "Email Notifications".
                let metaType = meta.eventType || meta.EventType || meta.emailType || meta.EmailType || meta.type || meta.Type || '';
                let kind = String(metaType || e.subType || e.eventType || '').trim();
                kind = kind.replace(/^email[\.\s:_-]*/i, '');
                kind = kind.split(':')[0];
                if (!kind) kind = 'Email';
                const label = humanize(kind);
                return { ...e, __groupKey: `Email:${label}`, __groupLabel: label };
            });
        const loginEvents = allEvents.filter(e => includesAny(e, ['login', 'session']));
        const lifecycleEventsRaw = allEvents.filter(e => classifyLifecycleCategory(e));
        const deviceLifecycleRaw = lifecycleEventsRaw.filter(e => classifyLifecycleCategory(e) === 'Device');
        const orgLifecycleRaw = lifecycleEventsRaw.filter(e => classifyLifecycleCategory(e) === 'Org');

        const userSessionsFromApi = buildUserSessionsFromAccessSummary(uxSummary?.access);
        const userSessionsRaw = userSessionsFromApi || computeUserSessions(allEvents);

        const emailNotifications = groupByDayCustom(
            emailEvents,
            (e) => e.__groupKey,
            (e) => e.__groupLabel
        );
        const loginTimeline = groupLoginEvents(loginEvents);
        const lifecycleEvents = groupLifecycleEvents(lifecycleEventsRaw);
        const deviceLifecycleEvents = groupLifecycleEvents(deviceLifecycleRaw);
        const orgLifecycleEvents = groupLifecycleEvents(orgLifecycleRaw);

        return {
            creditConsumption: { dataPoints: creditDataPoints },
            licenseAdjustments: licenseAdjustmentEvents,
            aiReports,
            deviceLifecycle: deviceLifecycleEvents,
            emailNotifications,
            loginTimeline,
            lifecycleEvents,
            lifecycleDeviceEvents: deviceLifecycleEvents,
            lifecycleOrgEvents: orgLifecycleEvents,
            userSessions: userSessionsRaw
        };
    };

    const loadAnalytics = async () => {
        // Reload analytics data (same as loadEvents for now)
        await loadEvents();
    };

    const fetchAuditPage = async (orgId, pageToken = null) => {
        const warpDate = window.rewindContext?.getDate?.() || null;
        const query = new URLSearchParams({
            pageSize: '100',
            days: String(rangeDays),
            normalize: 'true'
        });

        // When Time Warp is active, pass the historical end-date so the backend returns
        // events from (warpDate − rangeDays) through warpDate instead of from today.
        if (warpDate) {
            query.set('date', warpDate);
        }

        if (pageToken) {
            query.set('pageToken', pageToken);
        } else {
            query.set('includeUxSummary', 'true');
        }

        const res = await api.get(`/api/v1/orgs/${orgId}/audit?${query.toString()}`);
        if (!res.success || !res.data) {
            throw new Error(res.message || 'Failed to load audit events');
        }

        return {
            events: res.data.events || [],
            continuationToken: res.data.continuationToken || null,
            uxSummary: res.data.uxSummary || null
        };
    };

    const loadNextPage = async () => {
        const currentOrg = orgContext.getCurrentOrg();
        if (!currentOrg?.orgId || loading || loadingMore || !hasMore || !nextPageTokenRef.current) {
            return;
        }

        try {
            setLoadingMore(true);
            const pageData = await fetchAuditPage(currentOrg.orgId, nextPageTokenRef.current);
            nextPageTokenRef.current = pageData.continuationToken;
            setHasMore(Boolean(pageData.continuationToken));
            setLoadedPages(prev => prev + 1);

            setEvents(prevEvents => {
                const merged = [...prevEvents, ...(pageData.events || [])];
                const cacheKey = `audit_${currentOrg.orgId}_${rangeDays}`;
                setCachedAuditData(cacheKey, {
                    events: merged,
                    hasMore: Boolean(pageData.continuationToken),
                    nextPageToken: pageData.continuationToken || null,
                    loadedPages: loadedPages + 1,
                    uxSummary: pageData.uxSummary || uxSummary
                });

                return merged;
            });

            if (pageData.uxSummary) {
                setUxSummary(pageData.uxSummary);
            }
        } catch (err) {
            console.warn('[Audit] Failed to load next page:', err);
        } finally {
            setLoadingMore(false);
        }
    };

    const loadEvents = async (forceRefresh = false) => {
        try {
            logger.debug('[Audit] loadEvents called');
            const currentOrg = orgContext.getCurrentOrg();

            if (!currentOrg?.orgId) {
                logger.warn('[Audit] No org selected');
                toast.show('Please select an organization', 'warning');
                return;
            }

            const _warpDate = window.rewindContext?.getDate?.() || null;
            const cacheKey = _warpDate
                ? `audit_${currentOrg.orgId}_${rangeDays}_warp_${_warpDate}`
                : `audit_${currentOrg.orgId}_${rangeDays}`;

            // Step 1: Try cache first (unless force refresh)
            if (!forceRefresh) {
                const cached = getCachedAuditData(cacheKey, 30); // 30 minute TTL
                if (cached) {
                    logger.debug('[Audit] Loading from cache immediately (even if stale)...');
                    setEvents(cached.data.events || []);
                    setUxSummary(cached.data.uxSummary || null);
                    setHasMore(cached.data.hasMore || false);
                    nextPageTokenRef.current = cached.data.nextPageToken || null;
                    setLoadedPages(Math.max(1, cached.data.loadedPages || 1));
                    
                    // Use timeline events for analytics charts (no duplication—uxSummary contains only sessions).
                    const chartEventsForAnalytics = cached.data.events || [];
                    const analyticsData = computeAnalytics(chartEventsForAnalytics, cached.data.uxSummary || null);
                    setAnalytics(analyticsData);
                    setLoading(false);
                    setLoadingAnalytics(false);
                    setIsRefreshingInBackground(true);
                    
                    // Always trigger background refresh (even if cache not stale)
                    loadFreshEvents(cacheKey, currentOrg.orgId);
                    return;
                }
            }

            // Step 2: Show loading state if no cache
            setLoading(true);
            setLoadingAnalytics(true);

            const pageData = await fetchAuditPage(currentOrg.orgId, null);
            const firstPageEvents = pageData.events || [];
            nextPageTokenRef.current = pageData.continuationToken;

            setEvents(firstPageEvents);
            setHasMore(Boolean(pageData.continuationToken));
            setLoadedPages(1);
            setUxSummary(pageData.uxSummary || null);

            setCachedAuditData(cacheKey, {
                events: firstPageEvents,
                hasMore: Boolean(pageData.continuationToken),
                nextPageToken: pageData.continuationToken || null,
                loadedPages: 1,
                uxSummary: pageData.uxSummary || null
            });

            const analyticsData = computeAnalytics(pageData.uxSummary?.events || firstPageEvents, pageData.uxSummary || null);
            setAnalytics(analyticsData);
        } catch (error) {
            logger.error('[Audit] Error loading events:', error);
            toast.show('Failed to load audit events', 'error');
        } finally {
            setLoading(false);
            setLoadingAnalytics(false);
            setIsRefreshingInBackground(false);
        }
    };

    const loadFreshEvents = async (cacheKey, orgId) => {
        try {
            logger.debug('[Audit] Background refresh starting...');
            
            // Wait for UI to settle
            await new Promise(resolve => setTimeout(resolve, 500));

            const pageData = await fetchAuditPage(orgId, null);
            const firstPageEvents = pageData.events || [];

            nextPageTokenRef.current = pageData.continuationToken;

            setCachedAuditData(cacheKey, {
                events: firstPageEvents,
                hasMore: Boolean(pageData.continuationToken),
                nextPageToken: pageData.continuationToken || null,
                loadedPages: 1,
                uxSummary: pageData.uxSummary || uxSummary
            });

            // Silent update with latest first-page snapshot
            setEvents(firstPageEvents);
            setHasMore(Boolean(pageData.continuationToken));
            setLoadedPages(1);
            if (pageData.uxSummary) {
                setUxSummary(pageData.uxSummary);
            }

            // Prefer server chart summary (full-range) over first-page timeline slice.
            const analyticsData = computeAnalytics(pageData.uxSummary?.events || firstPageEvents, pageData.uxSummary || null);
            setAnalytics(analyticsData);
            setIsRefreshingInBackground(false);

            logger.debug('[Audit] Background refresh complete');
        } catch (err) {
            console.warn('[Audit] Background refresh failed:', err);
            setIsRefreshingInBackground(false);
        }
    };

    const renderAllCharts = (analyticsData) => {
        if (typeof window.Chart === 'undefined') {
            logger.warn('[Audit] Chart.js not loaded');
            return;
        }

        requestAnimationFrame(() => {
            // Render critical charts first
            renderCreditConsumptionChart(analyticsData.creditConsumption, rangeDays);
            renderEmailNotificationsChart(analyticsData.emailNotifications);
            
            // Defer remaining charts to next frame
            requestAnimationFrame(() => {
                renderLoginTimelineChart(analyticsData.loginTimeline);
                renderLifecycleChart(analyticsData.lifecycleOrgEvents, 'lifecycleOrgChart', 'No organization lifecycle events available');
                renderUserActivityChart(analyticsData.userSessions);
            });
        });
    };

    const renderNoDataCanvas = (canvas, message) => {
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const existingChart = Chart.getChart(canvas);
        if (existingChart) existingChart.destroy();

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        const bodyStyles = getComputedStyle(document.body);
        const textColor = bodyStyles.getPropertyValue('--tblr-secondary')?.trim() || '#6c757d';
        ctx.fillStyle = textColor;
        ctx.font = '14px Segoe UI, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(message, canvas.width / 2, canvas.height / 2);
        ctx.restore();
    };

    const renderCreditConsumptionChart = (data, daysRange = 7) => {
        const canvas = document.getElementById('creditConsumptionChart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const existingChart = Chart.getChart(canvas);
        if (existingChart) existingChart.destroy();

        const points = data.dataPoints || [];
        if (points.length === 0) {
            renderNoDataCanvas(canvas, 'No credit consumption data available');
            return;
        }

        // Filter to selected time range
        const now = new Date();
        const cutoffDate = new Date(now);
        cutoffDate.setDate(cutoffDate.getDate() - daysRange);
        
        const filteredPoints = points.filter(p => new Date(p.timestamp) >= cutoffDate);

        // Convert credits to days: days = credits / seats (1 credit per seat per day)
        const pointsWithDays = filteredPoints.map(p => ({
            ...p,
            days: Math.round((p.remaining || 0) / Math.max(1, p.seats || 1))
        }));

        // Sort by timestamp for proper X-axis ordering
        const sortedPoints = pointsWithDays.slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        new Chart(ctx, {
            type: 'line',
            data: {
                labels: sortedPoints.map(p => new Date(p.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
                datasets: [
                    {
                        label: 'Remaining Days Left',
                        data: sortedPoints.map(p => ({
                            x: new Date(p.timestamp),
                            y: p.days,
                            timestamp: p.timestamp,
                            isAdjustment: p.isAdjustment,
                            creditsDiff: p.consumed,
                            eventType: p.eventType,
                            reason: p.reason
                        })),
                        borderColor: '#206bc4',
                        backgroundColor: 'rgba(32, 107, 196, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4,
                        pointRadius: (context) => {
                            const point = context.raw;
                            return point.isAdjustment ? 7 : 3; // Larger dots for adjustments
                        },
                        pointBackgroundColor: (context) => {
                            const point = context.raw;
                            // For adjustments: Green if credits added, Red if credits reduced
                            if (point.isAdjustment) {
                                return point.creditsDiff > 0 ? '#28a745' : '#dc3545'; // Green for additions, Red for reductions
                            }
                            return '#206bc4'; // Blue for regular consumption
                        },
                        pointBorderColor: (context) => {
                            const point = context.raw;
                            if (point.isAdjustment) {
                                return point.creditsDiff > 0 ? '#1e7e34' : '#a02622'; // Darker green/red for borders
                            }
                            return '#0e4f8f';
                        },
                        pointBorderWidth: (context) => {
                            const point = context.raw;
                            return point.isAdjustment ? 3 : 1; // Thicker border for adjustments
                        }
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            generateLabels: (chart) => [
                                { text: '📈 Days Remaining', fillStyle: '#206bc4', hidden: false },
                                { text: '🟢 Credit Added', fillStyle: '#28a745', hidden: false },
                                { text: '🔴 Credit Reduced', fillStyle: '#dc3545', hidden: false }
                            ]
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        padding: 12,
                        titleFont: { size: 13, weight: 'bold' },
                        bodyFont: { size: 12 },
                        callbacks: {
                            title: () => 'Days Remaining',
                            label: (context) => {
                                const point = context.raw;
                                const lines = [`${point.y} days`];
                                if (point.isAdjustment) {
                                    lines.push(`Adjustment: ${point.creditsDiff > 0 ? '+' : ''}${point.creditsDiff}`);
                                    if (point.reason) lines.push(`Reason: ${point.reason}`);
                                }
                                return lines;
                            },
                            afterLabel: (context) => {
                                const point = context.raw;
                                const date = new Date(point.timestamp);
                                return `${date.toLocaleDateString('en-US')} ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Days Remaining', font: { weight: 'bold' } },
                        ticks: { callback: (v) => `${v}d` }
                    },
                    x: {
                        type: 'time',
                        time: {
                            unit: 'day',
                            displayFormats: {
                                day: 'MMM d'
                            }
                        },
                        min: cutoffDate,
                        max: now,
                        title: { display: true, text: 'Date', font: { weight: 'bold' } }
                    }
                }
            }
        });
    };

    const renderEmailNotificationsChart = (data) => {
        const canvas = document.getElementById('emailNotificationsChart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const existingChart = Chart.getChart(canvas);
        if (existingChart) existingChart.destroy();

        const dates = data.dates || [];
        const series = data.series || [];
        if (dates.length === 0 || series.length === 0) {
            renderNoDataCanvas(canvas, 'No email notification data available');
            return;
        }

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: dates.map(d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
                datasets: series
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'top' },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}`
                        }
                    }
                },
                scales: {
                    y: { beginAtZero: true, stacked: true, ticks: { stepSize: 1 }, title: { display: true, text: 'Count' } },
                    x: { stacked: true, title: { display: true, text: 'Date' } }
                }
            }
        });
    };

    const renderLoginTimelineChart = (data) => {
        const canvas = document.getElementById('loginTimelineChart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const existingChart = Chart.getChart(canvas);
        if (existingChart) existingChart.destroy();

        const dates = data.dates || [];
        const series = data.series || [];
        if (dates.length === 0 || series.length === 0) {
            renderNoDataCanvas(canvas, 'No login activity data available');
            return;
        }

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: dates.map(d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
                datasets: series
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'top' },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y}`
                        }
                    }
                },
                scales: {
                    y: { beginAtZero: true, stacked: true, ticks: { stepSize: 1 }, title: { display: true, text: 'Events' } },
                    x: { stacked: true, title: { display: true, text: 'Date' }, ticks: { maxRotation: 45, minRotation: 45 } }
                }
            }
        });
    };

    const renderLifecycleChart = (data, canvasId = 'lifecycleChart', noDataMessage = 'No lifecycle event data available') => {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const existingChart = Chart.getChart(canvas);
        if (existingChart) existingChart.destroy();

        const dates = data.dates || [];
        const series = data.series || [];
        if (dates.length === 0 || series.length === 0) {
            renderNoDataCanvas(canvas, noDataMessage);
            return;
        }

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: dates.map(d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })),
                datasets: series
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true, position: 'top' },
                    tooltip: { mode: 'index', intersect: false }
                },
                scales: {
                    x: { stacked: true, title: { display: true, text: 'Date' } },
                    y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1 }, title: { display: true, text: 'Events' } }
                }
            }
        });
    };

    const renderUserActivityChart = (userSessionsData) => {
        const chartEl = document.getElementById('userActivityChart');
        if (!chartEl) return;

        if (!window.ApexCharts) {
            chartEl.innerHTML = '<p class="text-muted text-center p-4">ApexCharts library not loaded</p>';
            return;
        }

        if (chartEl._apexChart) {
            chartEl._apexChart.destroy();
            chartEl._apexChart = null;
        }

        if (!userSessionsData || Object.keys(userSessionsData).length === 0) {
            chartEl.innerHTML = '<p class="text-muted text-center p-4">No user activity data available</p>';
            return;
        }

        const roleColors = {
            'SiteAdmin': '#9c27b0',
            'Owner':     '#206bc4',
            'Co-Admin':  '#f59f00',
            'Auditor':   '#2fb344',
            'System':    '#adb5bd',
            'Guest':     '#fd7e14',
            'Unknown':   '#868e96'
        };

        const roleOrder = ['SiteAdmin', 'Owner', 'Co-Admin', 'Auditor', 'Guest', 'System', 'Unknown'];
        const roleSeriesMap = {};

        Object.values(userSessionsData).forEach(actorSessions => {
            if (!actorSessions || actorSessions.length === 0) return;

            const { actorDisplay, actorRole } = actorSessions[0];
            const role = actorRole || 'Unknown';

            if (!roleSeriesMap[role]) {
                roleSeriesMap[role] = [];
            }

            actorSessions.forEach(session => {
                const startMs = session.startTime.getTime();
                const endMs = session.endTime.getTime();

                roleSeriesMap[role].push({
                    x: actorDisplay,
                    y: [startMs, endMs],
                    actorEmail: session.actorEmail || null
                });
            });
        });

        const series = Object.keys(roleSeriesMap)
            .sort((a, b) => roleOrder.indexOf(a) - roleOrder.indexOf(b))
            .map(role => ({
                name: role,
                data: roleSeriesMap[role]
            }));

        const colors = Object.keys(roleSeriesMap)
            .sort((a, b) => roleOrder.indexOf(a) - roleOrder.indexOf(b))
            .map(role => roleColors[role] || roleColors.Unknown);

        const uniqueLabels = new Set();
        series.forEach(s => s.data.forEach(d => uniqueLabels.add(d.x)));
        const container = chartEl.parentElement;
        if (container) {
            container.style.height = `${Math.max(280, uniqueLabels.size * 44 + 90)}px`;
        }

        const options = {
            chart: {
                type: 'rangeBar',
                height: '100%',
                animations: {
                    enabled: false
                },
                toolbar: {
                    show: true,
                    tools: {
                        download: true,
                        selection: true,
                        zoom: true,
                        zoomin: true,
                        zoomout: true,
                        pan: true,
                        reset: true
                    }
                },
                zoom: {
                    enabled: true,
                    type: 'x',
                    autoScaleYaxis: false
                }
            },
            plotOptions: {
                bar: {
                    horizontal: true,
                    barHeight: '52%',
                    rangeBarGroupRows: false
                }
            },
            stroke: {
                width: 1,
                colors: ['#ffffff']
            },
            colors,
            series,
            xaxis: {
                type: 'datetime',
                labels: {
                    datetimeUTC: false
                }
            },
            legend: {
                position: 'top'
            },
            tooltip: {
                x: {
                    formatter: (_val, opts) => {
                        const point = opts?.w?.config?.series?.[opts.seriesIndex]?.data?.[opts.dataPointIndex];
                        return point?.actorEmail || point?.x || 'Session';
                    }
                },
                y: {
                    formatter: (val) => {
                        if (!Array.isArray(val) || val.length < 2) return '';
                        const start = new Date(val[0]);
                        const end = new Date(val[1]);
                        const startStr = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        const endStr = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        return `${startStr} - ${endStr}`;
                    }
                }
            },
            dataLabels: {
                enabled: false
            }
        };

        chartEl.innerHTML = '';
        const chart = new ApexCharts(chartEl, options);
        chart.render();
        chartEl._apexChart = chart;
    };

    const applyFilters = () => {
        let filtered = [...events];

        // Event type filter
        if (filters.eventType !== 'all') {
            filtered = filtered.filter(e => getTypeKey(e) === filters.eventType);
        }

        // Search filter (searches description, performedBy, targetId)
        if (filters.search) {
            const searchLower = filters.search.toLowerCase();
            filtered = filtered.filter(e =>
                e.description?.toLowerCase().includes(searchLower) ||
                e.performedBy?.toLowerCase().includes(searchLower) ||
                e.performedByDisplay?.toLowerCase().includes(searchLower) ||
                e.targetId?.toLowerCase().includes(searchLower) ||
                e.eventType?.toLowerCase().includes(searchLower) ||
                (e.subType && e.subType.toLowerCase().includes(searchLower))
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
    };

    const getEventIcon = (evt) => {
        const base = String(getBaseType(evt) || '').toUpperCase();
        const iconMap = {
            'CREDIT': 'ti-coins',
            'EMAIL': 'ti-mail',
            'LICENSE': 'ti-key',
            'ORG': 'ti-building',
            'DEVICE': 'ti-device-desktop',
            'CONFIG': 'ti-settings',
            'WHATSAPP': 'ti-brand-whatsapp',
            'SECURITY_REPORT': 'ti-report',
            'CRONRUN': 'ti-clock',
            'Credit': 'ti-coins',
            'CreditConsumption': 'ti-coins',
            'Email': 'ti-mail',
            'Login': 'ti-login',
            'Device': 'ti-device-desktop',
            'License': 'ti-key',
            'Org': 'ti-building',
            'PersonalOrg': 'ti-building',
            'OrgMember': 'ti-users',
            'Member': 'ti-users',
            'Session': 'ti-clock',
            'Config': 'ti-settings',
            'Configuration': 'ti-settings',
            'ResponseCommand': 'ti-terminal',
            'Default': 'ti-circle'
        };
        // Keep specific legacy icons where helpful
        const specificMap = {
            'CreditConsumptionJobStarted': 'ti-player-play',
            'CreditConsumptionJobCompleted': 'ti-check',
            'CreditConsumptionJobFailed': 'ti-x',
            'DeviceBlocked': 'ti-ban',
            'DeviceDeleted': 'ti-trash',
            'DeviceDisabled': 'ti-device-desktop-off',
            'DeviceRegistered': 'ti-device-desktop-plus'
        };
        const key = typeof evt === 'string' ? evt : evt?.eventType;
        if (key && specificMap[key]) return specificMap[key];
        return iconMap[base] || iconMap[getBaseType(evt)] || iconMap['Default'];
    };

    const getEventColor = (evt) => {
        const base = String(getBaseType(evt) || '').toUpperCase();
        const key = typeof evt === 'string' ? evt : evt?.eventType;
        const colorMap = {
            'CREDIT': 'info',
            'EMAIL': 'info',
            'LICENSE': 'secondary',
            'ORG': 'secondary',
            'DEVICE': 'secondary',
            'CONFIG': 'info',
            'WHATSAPP': 'success',
            'SECURITY_REPORT': 'info',
            'CRONRUN': 'info',
            'CreditConsumptionJobStarted': 'info',
            'CreditConsumptionJobCompleted': 'success',
            'CreditConsumptionJobFailed': 'danger',
            'Email': 'info',
            'EmailSent': 'success',
            'EmailFailed': 'danger',
            'Device': 'secondary',
            'DeviceBlocked': 'warning',
            'DeviceDeleted': 'danger',
            'DeviceDisabled': 'warning',
            'DeviceEnabled': 'info',
            'License': 'secondary',
            'LicenseDisabled': 'warning',
            'LicenseExpired': 'danger',
            'LicenseCreditsLow': 'warning',
            'LicenseExpiringSoon': 'warning',
            'OrgDisabled': 'danger',
            'Org': 'secondary',
            'PersonalOrg': 'secondary',
            'PersonalOrgCreated': 'success',
            'PersonalOrgUpdated': 'info',
            'OrgMember': 'secondary',
            'OrgMemberAdded': 'success',
            'OrgMemberRemoved': 'warning',
            'OrgMemberRoleUpdated': 'info',
            'Config': 'info',
            'Configuration': 'info',
            'ResponseCommand': 'info',
            'ResponseCommandQueued': 'info',
            'Login': key && key.toLowerCase().includes('failure') ? 'danger' : 'success',
            'CreditConsumption': 'info'
        };
        return colorMap[key] || colorMap[base] || colorMap[getBaseType(evt)] || 'secondary';
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
        const types = new Map();
        events.forEach(e => {
            const key = getTypeKey(e);
            if (!key) return;
            const label = getTypeLabel(e);
            types.set(key, label);
        });
        return Array.from(types.entries())
            .map(([value, label]) => ({ value, label }))
            .sort((a, b) => a.label.localeCompare(b.label));
    };

    const timelineEvents = filteredEvents;

    const renderAnalyticsTab = () => {
        return html`
            <!-- Analytics Dashboard -->
            <div class="row g-3 mb-3">
                <div class="col-md-3">
                    <label class="form-label">Time Range</label>
                    <select
                        class="form-select"
                        value=${rangeDays}
                        onChange=${(e) => setRangeDays(Number(e.target.value) || 7)}
                    >
                        <option value="7">Last 7 days</option>
                        <option value="30">Last 30 days</option>
                        <option value="90">Last 90 days</option>
                        <option value="180">Last 180 days</option>
                        <option value="365">Last 365 days</option>
                    </select>
                </div>
            </div>

            ${loadingAnalytics ? html`
                <div class="text-center py-5">
                    <div class="spinner-border text-primary" role="status"></div>
                    <div class="mt-2">Loading analytics...</div>
                </div>
            ` : analytics ? html`
                <div class="row row-cards mb-3">
                    <!-- Credit Consumption Chart -->
                    <div class="col-lg-6">
                        <div class="card">
                            <div class="card-header">
                                <h3 class="card-title"><i class="ti ti-coins me-2"></i>Credit Consumption</h3>
                            </div>
                            <div class="card-body">
                                <div style="height: 300px; position: relative;">
                                    <canvas id="creditConsumptionChart"></canvas>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Email Notifications Chart -->
                    <div class="col-lg-6">
                        <div class="card">
                            <div class="card-header">
                                <h3 class="card-title"><i class="ti ti-mail me-2"></i>Email Notifications</h3>
                            </div>
                            <div class="card-body">
                                <div style="height: 300px; position: relative;">
                                    <canvas id="emailNotificationsChart"></canvas>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Login Timeline Chart -->
                    <div class="col-lg-6">
                        <div class="card">
                            <div class="card-header">
                                <h3 class="card-title"><i class="ti ti-login me-2"></i>Login Timeline</h3>
                            </div>
                            <div class="card-body">
                                <div style="height: 300px; position: relative;">
                                    <canvas id="loginTimelineChart"></canvas>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Organization Lifecycle Chart -->
                    <div class="col-lg-6">
                        <div class="card">
                            <div class="card-header">
                                <h3 class="card-title"><i class="ti ti-building me-2"></i>Organization Lifecycle Events</h3>
                            </div>
                            <div class="card-body">
                                <div style="height: 300px; position: relative;">
                                    <canvas id="lifecycleOrgChart"></canvas>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- License Adjustments Table -->
                    <!-- Merged into Credit Consumption chart as colored markers -->

                    <!-- User Activity Sessions Chart -->
                    <div class="col-lg-12">
                        <div class="card">
                            <div class="card-header">
                                <h3 class="card-title"><i class="ti ti-user-check me-2"></i>User Activity Sessions (API Access)</h3>
                            </div>
                            <div class="card-body">
                                <div style="height: 400px; position: relative;">
                                    <div id="userActivityChart" style="height: 100%; width: 100%;"></div>
                                </div>
                                <div class="text-muted small mt-2">
                                    <i class="ti ti-zoom-in-area me-1"></i>
                                    Use chart toolbar for zoom and pan.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            ` : html`
                <div class="empty">
                    <div class="empty-icon"><i class="ti ti-chart-line"></i></div>
                    <p class="empty-title">No analytics data available</p>
                </div>
            `}
        `;
    };

    const renderEventFrequencyChart = (events = []) => {
        if (typeof window.Chart === 'undefined' || events.length === 0) {
            return;
        }

        const canvas = document.getElementById('eventFrequencyChart');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const existingChart = Chart.getChart(canvas);
        if (existingChart) existingChart.destroy();

        // Group events by date and type
        const eventsByDateAndType = {};
        const { dates, start, end } = buildDateRange(rangeDays);

        events.forEach(event => {
            const eventDate = new Date(event.timestamp);
            if (eventDate < start || eventDate > end) return;

            const dateKey = toLocalDayKey(eventDate);
            if (!eventsByDateAndType[dateKey]) {
                eventsByDateAndType[dateKey] = {};
            }

            const eventType = getTypeKey(event);
            eventsByDateAndType[dateKey][eventType] = (eventsByDateAndType[dateKey][eventType] || 0) + 1;
        });

        // Get unique event types
        const eventTypes = new Set();
        Object.values(eventsByDateAndType).forEach(dayEvents => {
            Object.keys(dayEvents).forEach(type => eventTypes.add(type));
        });
        const sortedEventTypes = Array.from(eventTypes).sort();

        // Color mapping for important event types
        const colorMap = {
            'CRONRUN': 'rgba(75, 192, 192, 0.7)',
            'CreditConsumption': 'rgba(54, 162, 235, 0.7)',
            'CreditConsumptionJobStarted': 'rgba(100, 162, 235, 0.7)',
            'CreditConsumptionJobCompleted': 'rgba(40, 167, 69, 0.7)',
            'CreditConsumptionJobFailed': 'rgba(220, 53, 69, 0.7)',
            'Heartbeat': 'rgba(255, 193, 7, 0.7)',
            'Login': 'rgba(153, 102, 255, 0.7)',
            'License': 'rgba(201, 203, 207, 0.7)',
            'Device': 'rgba(255, 159, 64, 0.7)',
            'Audit': 'rgba(255, 99, 132, 0.7)'
        };

        const deterministicPalette = [
            'rgba(32, 107, 196, 0.7)',
            'rgba(40, 167, 69, 0.7)',
            'rgba(214, 57, 57, 0.7)',
            'rgba(245, 159, 0, 0.7)',
            'rgba(23, 162, 184, 0.7)',
            'rgba(0, 123, 255, 0.7)',
            'rgba(111, 66, 193, 0.7)',
            'rgba(32, 201, 151, 0.7)'
        ];

        const getColor = (type) => {
            // Direct match
            if (colorMap[type]) return colorMap[type];
            // Partial match (e.g., "License:Created" -> "License")
            const base = type.split(':')[0];
            if (colorMap[base]) return colorMap[base];

            let hash = 0;
            for (let i = 0; i < type.length; i++) {
                hash = ((hash << 5) - hash) + type.charCodeAt(i);
                hash |= 0;
            }

            return deterministicPalette[Math.abs(hash) % deterministicPalette.length];
        };

        // Build datasets
        const datasets = sortedEventTypes.map(type => ({
            label: type,
            data: dates.map(date => eventsByDateAndType[date]?.[type] || 0),
            backgroundColor: getColor(type),
            borderColor: getColor(type).replace('0.7', '1'),
            borderWidth: 0,
            borderRadius: 2
        }));

        // Create chart
        const chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: dates.map(d => {
                    const date = parseLocalDayKey(d);
                    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                }),
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        stacked: true,
                        grid: {
                            display: false
                        },
                        ticks: {
                            maxRotation: 45,
                            minRotation: 45,
                            font: { size: 11 }
                        }
                    },
                    y: {
                        stacked: true,
                        title: {
                            display: true,
                            text: 'Event Count'
                        },
                        grid: {
                            color: getComputedStyle(document.body).getPropertyValue('--tblr-border-color').trim() || 'rgba(0,0,0,0.05)'
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            usePointStyle: true,
                            padding: 15,
                            font: { size: 11 }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            footer: function (context) {
                                const dateIndex = context[0].dataIndex;
                                const dateKey = dates[dateIndex];
                                const totalEvents = context.reduce((sum, ctx) => sum + ctx.parsed.y, 0);

                                // Check for gaps (no events on this date)
                                if (totalEvents === 0) {
                                    return '⚠️ No events recorded';
                                }

                                return `Total: ${totalEvents} events`;
                            }
                        }
                    }
                }
            }
        });
    };

    const renderTimelineTab = () => {
        // Trigger event frequency chart render when tab becomes active
        useEffect(() => {
            if (activeTab === 'timeline' && filteredEvents.length > 0) {
                requestAnimationFrame(() => renderEventFrequencyChart(filteredEvents));
            }
        }, [filteredEvents, activeTab]);

        return html`
            <!-- Timeline View -->
            ${creditJobEvents.length > 0 && html`
                <div class="card mb-3">
                    <div class="card-header">
                        <h3 class="card-title">
                            <i class="ti ti-heartbeat me-2"></i>
                            Credit Consumption Job Heartbeat
                        </h3>
                        <div class="card-actions">
                            <span class="badge bg-info-lt text-info">
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

            <!-- Event Frequency Timeline Chart -->
            ${filteredEvents.length > 0 && html`
                <div class="card mb-3">
                    <div class="card-header">
                        <h3 class="card-title">
                            <i class="ti ti-chart-timeline me-2"></i>
                            Event Frequency Timeline
                        </h3>
                        <div class="card-actions">
                            <span class="badge bg-secondary-lt text-secondary">
                                ${filteredEvents.length} total events
                            </span>
                        </div>
                    </div>
                    <div class="card-body">
                        <div style="height: 350px; position: relative;">
                            <canvas id="eventFrequencyChart"></canvas>
                        </div>
                        <div class="mt-3 text-muted small">
                            <i class="ti ti-info-circle me-1"></i>
                            <strong>Stacked bar chart:</strong> Visualizes event distribution by type and date.
                            Empty days indicate no activity and may signal issues (e.g., cron not running, credit consumption paused).
                            Hover over bars for details.
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
                                    <option value=${type.value}>${type.label}</option>
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
                                aria-label="Search audit events"
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
                                aria-label="Audit filter from date"
                                value=${filters.dateFrom}
                                max=${filters.dateTo || maxSelectableDate}
                                onChange=${(e) => handleFilterChange('dateFrom', e.target.value)}
                            />
                        </div>
                        <div class="col-md-2">
                            <label class="form-label">To Date</label>
                            <input 
                                type="date"
                                class="form-control"
                                aria-label="Audit filter to date"
                                value=${filters.dateTo}
                                max=${maxSelectableDate}
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

            <!-- Vertical Timeline -->
            ${timelineEvents.length === 0 ? html`
                <div class="empty">
                    <div class="empty-icon">
                        <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="64" height="64" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 8l0 4l2 2" /><circle cx="12" cy="12" r="9" /></svg>
                    </div>
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
                        ${timelineEvents.map((event) => {
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
                                                    <strong>${getTypeLabel(event)}</strong>
                                                    <div class="text-muted small">${event.description || 'No description'}</div>
                                                    ${getActorLabel(event, isSiteAdmin) && html`
                                                        <div class="text-muted small mt-1">
                                                            <i class="ti ti-user me-1"></i>
                                                            ${getActorLabel(event, isSiteAdmin)}
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
                                                            <pre class="json-metadata mt-2 p-2 rounded small">${JSON.stringify(event.metadata, null, 2)}</pre>
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

                ${hasMore && !loading ? html`
                    <div ref=${scrollObserverRef} style="height: 24px; margin-top: 0;"></div>
                ` : null}
                ${loadingMore ? html`
                    <div class="text-center py-3">
                        <span class="spinner-border spinner-border-sm me-2" role="status"></span>
                        <span class="text-muted">Loading more events...</span>
                    </div>
                ` : null}
                ${activeTab === 'timeline' && (loadedPages > 1 || events.length > 5) ? html`
                    <div class="d-flex justify-content-center mt-3">
                        <button
                            class="btn btn-outline-secondary btn-sm"
                            onClick=${() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                        >
                            <i class="ti ti-arrow-up me-1"></i>
                            Go to top
                        </button>
                    </div>
                ` : null}
            `}
        `;
    };

    // Main render function
    try {
        if (loading && filteredEvents.length === 0) {
        return html`
            <div class="container-xl">
                <div class="d-flex justify-content-center align-items-center" style="min-height: 400px;">
                    <div class="spinner-border" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                </div>
            </div>
        `;
    }

    return html`
            <div class="container-xl">
                <div class="page-header d-print-none">
                    <div class="row align-items-center">
                        <div class="col">
                            <div class="d-flex align-items-center gap-2">
                                <h2 class="page-title mb-0">Command Log</h2>
                                ${(loading || loadingAnalytics) && !isRefreshingInBackground ? html`
                                    <span class="badge bg-azure-lt text-azure d-inline-flex align-items-center gap-1">
                                        <span class="spinner-border spinner-border-sm" style="width: 12px; height: 12px;"></span>
                                        Loading...
                                    </span>
                                ` : ''}
                                ${isRefreshingInBackground ? html`
                                    <span class="badge bg-info-lt text-info d-inline-flex align-items-center gap-1">
                                        <span class="spinner-border spinner-border-sm" style="width: 12px; height: 12px;"></span>
                                        Refreshing...
                                    </span>
                                ` : ''}
                            </div>
                            <div class="text-muted mt-1">
                                ${activeTab === 'analytics' ? 'Analytics Dashboard' : `${filteredEvents.length} ${filteredEvents.length === 1 ? 'event' : 'events'}`}
                                ${activeTab === 'timeline' && (filters.eventType !== 'all' || filters.search || filters.dateFrom || filters.dateTo) ? '(filtered)' : ''}
                            </div>
                        </div>
                        <div class="col-auto">
                            <button class="btn btn-icon" onClick=${() => activeTab === 'analytics' ? loadAnalytics(true) : loadEvents(true)} title="Refresh">
                                <i class="ti ti-refresh"></i>
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Tab Navigation -->
                <div class="card mb-3">
                    <div class="card-header">
                        <ul class="nav nav-tabs card-header-tabs" role="tablist">
                            <li class="nav-item">
                                <a 
                                    class="nav-link ${activeTab === 'analytics' ? 'active' : ''}"
                                    href="#"
                                    role="tab"
                                    onClick=${(e) => { e.preventDefault(); setActiveTab('analytics'); }}
                                >
                                    <i class="ti ti-chart-line me-2"></i>
                                    Analytics
                                </a>
                            </li>
                            ${showTimelineTab ? html`
                                <li class="nav-item">
                                    <a 
                                        class="nav-link ${activeTab === 'timeline' ? 'active' : ''}"
                                        href="#"
                                        role="tab"
                                        onClick=${(e) => { e.preventDefault(); setActiveTab('timeline'); }}
                                    >
                                        <i class="ti ti-history me-2"></i>
                                        Timeline
                                    </a>
                                </li>
                            ` : null}
                        </ul>
                    </div>
                </div>

                ${(loading && activeTab === 'timeline') ? html`
                    <div class="alert alert-info d-flex align-items-center gap-2 mb-3" role="status" aria-live="polite">
                        <span class="spinner-border spinner-border-sm"></span>
                        <span>Loading timeline events...</span>
                    </div>
                ` : ''}

                <!-- Tab Content -->
                ${(activeTab === 'timeline' && showTimelineTab) ? renderTimelineTab() : renderAnalyticsTab()}
            </div>
        `;
    } catch (error) {
        logger.error('[Audit] Rendering error:', error);
        return html`
            <div class="container-xl">
                <div class="alert alert-danger">
                    <h4>Error rendering audit page</h4>
                    <p>${error.message}</p>
                    <button class="btn btn-primary mt-2" onClick=${() => window.location.reload()} >
                        Reload Page
                    </button>
                </div>
            </div>
        `;
    }
}

export default AuditPage;
