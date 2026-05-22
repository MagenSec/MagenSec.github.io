/**
 * Cron Activity Page - View cron job executions and report email activity
 */

import { api } from '@api';
import { orgContext } from '@orgContext';
import toast from '@toast';
import { logger } from '@config';

const { html } = window;
const { useState, useEffect, useRef } = window.preactHooks;

const LANE_ORDER = ['hot-detect', 'intel', 'sealed-org-data', 'business-ops', 'low-priority', 'manual'];
const LANE_LABELS = {
    'hot-detect': 'Hot Detect',
    'intel': 'Intel',
    'sealed-org-data': 'Sealed Org Data',
    'business-ops': 'Business Ops',
    'low-priority': 'Low Priority',
    'manual': 'Manual'
};
const LANE_ICON_CLASSES = {
    'hot-detect': 'ti-shield-search',
    'intel': 'ti-brain',
    'sealed-org-data': 'ti-database',
    'business-ops': 'ti-chart-bar',
    'low-priority': 'ti-clock',
    'manual': 'ti-hand-click'
};

const AUDIT_CHURN_METRICS = [
    { key: 'crudOps', label: 'CRUD ops', axisLabel: 'Table ops' },
    { key: 'rowsRead', label: 'Reads', axisLabel: 'Rows read' },
    { key: 'rowsWritten', label: 'Writes', axisLabel: 'Rows written' },
    { key: 'eventsProcessed', label: 'Processed', axisLabel: 'Rows processed' }
];

const AUDIT_CHURN_COLORS = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#dc2626', '#0891b2', '#be123c', '#4f46e5'];
const AUDIT_CHURN_SERIES_LIMIT = 8;
const OTHER_CRON_TASK_ID = '__other_cron_jobs__';
const OTHER_CRON_TASK_LABEL = 'Other Cron Jobs';
const OTHER_CRON_TASK_COLOR = '#64748b';
const CRON_CHURN_WINDOW_OPTIONS = [
    { key: '1d', days: 1, label: 'Last 24 hours', shortLabel: '1d' },
    { key: '3d', days: 3, label: 'Last 3 days', shortLabel: '3d' },
    { key: '7d', days: 7, label: 'Last 7 days', shortLabel: '7d' },
    { key: '15d', days: 15, label: 'Last 15 days', shortLabel: '15d' },
    { key: '30d', days: 30, label: 'Last 30 days', shortLabel: '30d' },
    { key: '60d', days: 60, label: 'Last 60 days', shortLabel: '60d' },
    { key: '90d', days: 90, label: 'Last 90 days', shortLabel: '90d' },
    { key: 'mtd', label: 'This month', shortLabel: 'MTD', monthToDate: true }
];
const CRON_CHURN_DEFAULT_WINDOW_KEY = '7d';
const CRON_CHURN_FETCH_DAYS = 90;
const CRON_CHURN_DEFAULT_FOCUS_KEY = 'all';
const CRON_CHURN_FOCUS_OPTIONS = [
    { key: 'all', label: 'All cron jobs', shortLabel: 'All' },
    {
        key: 'detectIntel',
        label: 'Detection + intel',
        shortLabel: 'Detect',
        laneIds: ['hot-detect', 'intel'],
        taskIds: ['Signal Assimilation', 'Detection Engine', 'ThreatIntel Enrichment', 'AppVersionIntel Enricher', 'CPE Dictionary Sync', 'CVE Sync', 'MSRC Patch Sync']
    },
    {
        key: 'businessDaily',
        label: 'Business jobs',
        shortLabel: 'Biz',
        laneIds: ['sealed-org-data', 'business-ops'],
        taskIds: ['Org Data Cook', 'Report Dispatch', 'Credit Consumption', 'Business Metrics Snapshots', 'Report Backfill', 'Daily Security Report']
    }
];
const CRON_CHURN_COST_MODE_OPTIONS = [
    { key: 'both', label: 'Split regular/manual', shortLabel: 'Split' },
    { key: 'regular', label: 'Regular business', shortLabel: 'Regular' },
    { key: 'manualRecovery', label: 'Manual/recovery', shortLabel: 'Manual' },
    { key: 'total', label: 'Total combined', shortLabel: 'Total' }
];
const CRON_CHURN_DEFAULT_COST_MODE_KEY = 'both';
const AZURE_TABLE_STANDARD_OPS_PRICE_USD_PER_10K = 0.00036;
const AZURE_CONTAINER_APPS_CPU_CORES = 0.5;
const AZURE_CONTAINER_APPS_MEMORY_GIB = 2;
const AZURE_CONTAINER_APPS_STANDARD_ACTIVE_VCPU_SECOND_USD = 0.000024;
const AZURE_CONTAINER_APPS_STANDARD_ACTIVE_GIB_SECOND_USD = 0.000003;
const DEFAULT_CRON_COST_MODEL = {
    currency: 'USD',
    pricingSource: 'Azure Retail Prices API 2023-01-01-preview, East US primary meters',
    defaultRegion: 'eastus',
    azureTableStandardOpsPriceUsdPer10K: AZURE_TABLE_STANDARD_OPS_PRICE_USD_PER_10K,
    containerApps: {
        eastus: {
            region: 'eastus',
            location: 'East US',
            skuName: 'Standard',
            cpuCores: AZURE_CONTAINER_APPS_CPU_CORES,
            memoryGiB: AZURE_CONTAINER_APPS_MEMORY_GIB,
            activeVcpuSecondUsd: AZURE_CONTAINER_APPS_STANDARD_ACTIVE_VCPU_SECOND_USD,
            activeGiBSecondUsd: AZURE_CONTAINER_APPS_STANDARD_ACTIVE_GIB_SECOND_USD,
            activeComputeSecondUsd: 0.000018,
            activeComputeHourUsd: 0.0648
        }
    }
};

const DIRECT_CRON_EVENT_LABELS = {
    SIGNAL_ASSIMILATION: 'Signal Assimilation',
    VULN_DETECTION: 'Detection Engine',
    THREAT_INTEL_ENRICHMENT: 'Threat Intel Enrichment'
};

const normalizeLaneId = (laneId) => String(laneId || '').trim().toLowerCase() || 'unassigned';

const formatLaneLabel = (laneId) => {
    const normalized = String(laneId || '').trim();
    if (!normalized) return 'Unassigned';
    return LANE_LABELS[normalized] || normalized
        .split('-')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
};

    const getLaneIconClass = (laneId) => LANE_ICON_CLASSES[normalizeLaneId(laneId)] || 'ti-route';

    const getLaneToneClass = (laneId) => `cron-task-lane-${normalizeLaneId(laneId).replace(/[^a-z0-9-]/g, '-')}`;

const formatExecutionScope = (scopeId) => {
    const normalized = String(scopeId || 'global').trim().toLowerCase();
    if (!normalized || normalized === 'global') return 'Global';
    return normalized.toUpperCase();
};

const getCronEventStatus = (event) => String(
    event?.metadata?.status ||
    event?.metadata?.Status ||
    event?.status ||
    ''
).toLowerCase();

const toNumber = (value, fallback = 0) => {
    if (value === null || value === undefined || value === '') return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};

const getDurationMsFromEvent = (event) => {
    const meta = event?.metadata || {};
    if (meta.durationSeconds !== undefined) return Math.round(toNumber(meta.durationSeconds) * 1000);
    if (meta.DurationMs !== undefined) return toNumber(meta.DurationMs);
    if (meta.durationMs !== undefined) return toNumber(meta.durationMs);
    if (meta.operationBudget?.durationMs !== undefined) return toNumber(meta.operationBudget.durationMs);
    if (meta.OperationBudget?.DurationMs !== undefined) return toNumber(meta.OperationBudget.DurationMs);
    return 0;
};

const getBudgetField = (budget, camelName, pascalName) => toNumber(
    budget?.[camelName] ?? budget?.[pascalName]
);

const getEventOperationBudget = (event) => {
    const meta = event?.metadata || {};
    const budget = meta.operationBudget || meta.OperationBudget || {};
    return {
        rowsScanned: getBudgetField(budget, 'rowsScanned', 'RowsScanned') + toNumber(meta.totalRowsScanned),
        rowsRead: getBudgetField(budget, 'rowsRead', 'RowsRead') + toNumber(meta.totalRowsRead),
        rowsWritten: getBudgetField(budget, 'rowsWritten', 'RowsWritten') + toNumber(meta.totalRowsWritten),
        rowsDeleted: getBudgetField(budget, 'rowsDeleted', 'RowsDeleted') + toNumber(meta.totalRowsDeleted),
        orgsTouched: getBudgetField(budget, 'orgsTouched', 'OrgsTouched'),
        devicesTouched: getBudgetField(budget, 'devicesTouched', 'DevicesTouched'),
        alertsTouched: getBudgetField(budget, 'alertsTouched', 'AlertsTouched')
    };
};

const getMetricValue = (...values) => {
    for (const value of values) {
        if (value !== undefined && value !== null && value !== '') {
            return toNumber(value);
        }
    }

    return 0;
};

const getEventDiagnostics = (event) => {
    const meta = event?.metadata || {};
    return meta.diagnostics || meta.Diagnostics || meta.metrics || meta.Metrics || {};
};

const getEventVolumeMetrics = (event) => {
    const meta = event?.metadata || {};
    const budget = getEventOperationBudget(event);
    const budgetDetails = meta.operationBudget || meta.OperationBudget || {};
    const budgetCounters = budgetDetails.counters || budgetDetails.Counters || {};
    const diagnostics = { ...getEventDiagnostics(event), ...budgetCounters };
    const volume = meta.volumeMetrics || meta.VolumeMetrics || diagnostics.volumeMetrics || diagnostics.VolumeMetrics || {};
    const rowsScanned = getMetricValue(
        volume.rowsScanned,
        volume.RowsScanned,
        budget.rowsScanned,
        diagnostics.rowsScanned,
        diagnostics.RowsScanned,
        diagnostics.inventoryRowsScanned,
        diagnostics.InventoryRowsScanned,
        diagnostics.scanned,
        diagnostics.Scanned
    );
    const rowsCreated = getMetricValue(
        volume.rowsCreated,
        volume.RowsCreated,
        diagnostics.rowsCreated,
        diagnostics.RowsCreated,
        diagnostics.cacheInserts,
        diagnostics.CacheInserts,
        diagnostics.alertsOpened,
        diagnostics.AlertsOpened,
        diagnostics.alertsOpen,
        diagnostics.AlertsOpen
    );
    const rowsUpdated = getMetricValue(
        volume.rowsUpdated,
        volume.RowsUpdated,
        diagnostics.rowsUpdated,
        diagnostics.RowsUpdated,
        diagnostics.cacheUpdates,
        diagnostics.CacheUpdates,
        diagnostics.alertsResolved,
        diagnostics.AlertsResolved,
        diagnostics.alertsClosed,
        diagnostics.AlertsClosed,
        diagnostics.staleVulnerableDemotions,
        diagnostics.StaleVulnerableDemotions,
        diagnostics.staleVulnerableTrimmed,
        diagnostics.StaleVulnerableTrimmed,
        diagnostics.refreshed,
        diagnostics.Refreshed
    );
    const rowsWrittenTotal = getMetricValue(volume.rowsWritten, volume.RowsWritten, budget.rowsWritten);
    const rowsWritten = rowsWrittenTotal > 0 ? rowsWrittenTotal : rowsCreated + rowsUpdated;
    const rowsRead = getMetricValue(volume.rowsRead, volume.RowsRead, budget.rowsRead) + rowsScanned;

    return {
        eventsProcessed: getMetricValue(volume.eventsProcessed, volume.EventsProcessed, diagnostics.eventsProcessed, diagnostics.EventsProcessed, meta.itemsProcessed, meta.entriesRefreshed),
        rowsProcessed: getMetricValue(volume.rowsProcessed, volume.RowsProcessed, diagnostics.rowsProcessed, diagnostics.RowsProcessed, diagnostics.totalRows, diagnostics.TotalRows, meta.itemsProcessed, meta.entriesRefreshed),
        rowsScanned,
        rowsRead,
        rowsCreated,
        rowsUpdated,
        rowsWritten,
        rowsDeleted: getMetricValue(volume.rowsDeleted, volume.RowsDeleted, budget.rowsDeleted),
        alertsGenerated: getMetricValue(volume.alertsGenerated, volume.AlertsGenerated, diagnostics.alertsGenerated, diagnostics.AlertsGenerated, diagnostics.alertsOpened, diagnostics.AlertsOpened, diagnostics.alertsOpen, diagnostics.AlertsOpen),
        alertsClosed: getMetricValue(volume.alertsClosed, volume.AlertsClosed, diagnostics.alertsClosed, diagnostics.AlertsClosed, diagnostics.alertsResolved, diagnostics.AlertsResolved),
        alertsTouched: getMetricValue(volume.alertsTouched, volume.AlertsTouched, budget.alertsTouched)
    };
};

const formatDuration = (durationMs) => {
    const ms = toNumber(durationMs);
    if (ms <= 0) return '-';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
};

const formatRelativeTime = (value) => {
    const date = value instanceof Date ? value : (value ? new Date(value) : null);
    if (!date || Number.isNaN(date.getTime())) return '-';

    const diffMs = Date.now() - date.getTime();
    const absMs = Math.abs(diffMs);
    const suffix = diffMs >= 0 ? 'ago' : 'from now';
    if (absMs < 60000) return 'just now';
    if (absMs < 3600000) return `${Math.round(absMs / 60000)}m ${suffix}`;
    if (absMs < 86400000) return `${Math.round(absMs / 3600000)}h ${suffix}`;
    return `${Math.round(absMs / 86400000)}d ${suffix}`;
};

const truncateMiddle = (value, maxLength = 48) => {
    const text = String(value || '');
    if (text.length <= maxLength) return text;
    const head = Math.ceil((maxLength - 1) / 2);
    const tail = Math.floor((maxLength - 1) / 2);
    return `${text.slice(0, head)}...${text.slice(-tail)}`;
};

const truncateEnd = (value, maxLength = 96) => {
    const text = String(value || '');
    if (text.length <= maxLength) return text;
    return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
};

const formatDiagnosticLabel = (key) => String(key || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const formatDiagnosticValue = (value) => {
    if (Array.isArray(value)) return value.join(', ');
    if (value && typeof value === 'object') return JSON.stringify(value);
    return String(value ?? '');
};

const formatCompactNumber = (value) => {
    const n = toNumber(value);
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return `${Math.round(n)}`;
};

const normalizeCronCostModel = (costModel) => ({
    ...DEFAULT_CRON_COST_MODEL,
    ...(costModel || {}),
    containerApps: {
        ...DEFAULT_CRON_COST_MODEL.containerApps,
        ...((costModel && costModel.containerApps) || {})
    }
});

const getCronContainerAppCostConfig = (costModel) => {
    const model = normalizeCronCostModel(costModel);
    const region = String(model.defaultRegion || DEFAULT_CRON_COST_MODEL.defaultRegion).toLowerCase();
    return model.containerApps?.[region]
        || model.containerApps?.[DEFAULT_CRON_COST_MODEL.defaultRegion]
        || DEFAULT_CRON_COST_MODEL.containerApps.eastus;
};

const estimateAzureTableOperationCostUsd = (operationCount, costModel) => {
    const model = normalizeCronCostModel(costModel);
    return (toNumber(operationCount) / 10000) * toNumber(model.azureTableStandardOpsPriceUsdPer10K, AZURE_TABLE_STANDARD_OPS_PRICE_USD_PER_10K);
};

const estimateContainerAppComputeCostUsd = (durationMs, costModel) => {
    const activeSeconds = toNumber(durationMs) / 1000;
    if (activeSeconds <= 0) return 0;

    const config = getCronContainerAppCostConfig(costModel);
    const explicitSecondCost = toNumber(config.activeComputeSecondUsd);
    if (explicitSecondCost > 0) return activeSeconds * explicitSecondCost;

    const cpuCost = activeSeconds * toNumber(config.cpuCores, AZURE_CONTAINER_APPS_CPU_CORES) * toNumber(config.activeVcpuSecondUsd, AZURE_CONTAINER_APPS_STANDARD_ACTIVE_VCPU_SECOND_USD);
    const memoryCost = activeSeconds * toNumber(config.memoryGiB, AZURE_CONTAINER_APPS_MEMORY_GIB) * toNumber(config.activeGiBSecondUsd, AZURE_CONTAINER_APPS_STANDARD_ACTIVE_GIB_SECOND_USD);
    return cpuCost + memoryCost;
};

const estimateCronRunCostUsd = (source = {}, costModel) => estimateAzureTableOperationCostUsd(source.crudOps, costModel)
    + estimateContainerAppComputeCostUsd(source.durationMs, costModel);

const formatUsd = (value) => {
    const amount = toNumber(value);
    if (amount >= 1) return `$${amount.toFixed(2)}`;
    if (amount >= 0.01) return `$${amount.toFixed(3)}`;
    if (amount > 0) return `$${amount.toFixed(5)}`;
    return '$0';
};

const formatPlural = (count, singular, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;

const formatCronTaskLabel = (taskId) => {
    const raw = String(taskId || '').trim();
    if (!raw) return 'Unassigned';
    if (DIRECT_CRON_EVENT_LABELS[raw.toUpperCase()]) return DIRECT_CRON_EVENT_LABELS[raw.toUpperCase()];

    return raw
        .replace(/CronTask$/i, '')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[_.-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || raw;
};

const getScaleSeverityBadgeClass = (severity) => {
    const normalized = String(severity || '').toLowerCase();
    if (normalized === 'critical') return 'bg-danger text-white';
    if (normalized === 'warning') return 'bg-warning text-white';
    if (normalized === 'healthy') return 'bg-success text-white';
    return 'bg-secondary text-white';
};

const normalizeBadgeText = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const getCronBadgeInterpretation = (badgeText, existingTitle = '') => {
    const label = normalizeBadgeText(badgeText);
    const lower = label.toLowerCase();
    let interpretation = '';

    if (!label) return '';

    if (lower.includes('ago') || lower.includes('from now') || lower === 'never') {
        interpretation = 'Relative timing: when this event happened, or when the next scheduled run is expected.';
    } else if (lower.includes('needs review') || lower.includes('review') || lower.includes('failed') || lower.includes('overdue') || lower.includes('expired')) {
        interpretation = 'Action signal: this badge marks a failed, overdue, expired, or review-worthy cron state.';
    } else if (lower.includes('healthy') || lower.includes('success') || lower === 'ok' || lower.includes('on schedule') || lower.includes('no active scheduled lease')) {
        interpretation = 'Health signal: this badge indicates the cron task or lane is currently operating normally.';
    } else if (lower.includes('running') || lower.includes('queued')) {
        interpretation = 'Lifecycle signal: this badge shows work that is currently running or waiting to run.';
    } else if (lower.includes('manual') || lower.includes('recovery')) {
        interpretation = 'Cost attribution: manual/recovery work is separated from regular scheduled business cost.';
    } else if (lower.includes('regular')) {
        interpretation = 'Cost attribution: regular cost comes from scheduled/system cron work.';
    } else if (lower.includes('storage')) {
        interpretation = 'Storage cost estimate from Azure Table read, write, and delete operations.';
    } else if (lower.includes('compute')) {
        interpretation = 'Compute cost estimate from timed Azure Container Apps runtime for cron work.';
    } else if (lower.includes('total cost') || lower.startsWith('total $') || lower.startsWith('est ')) {
        interpretation = 'Estimated total combines table-operation storage cost and timed compute runtime cost.';
    } else if (lower.includes('crud') || /\bops\b/.test(lower) || lower.includes('table ops')) {
        interpretation = 'Table churn: total Azure Table rows read, written, or deleted by the selected cron work.';
    } else if (lower.includes('read')) {
        interpretation = 'Read pressure: rows scanned or read from Azure Tables for this window or task.';
    } else if (lower.includes('write')) {
        interpretation = 'Write pressure: rows created or updated in Azure Tables for this window or task.';
    } else if (lower.includes('delete')) {
        interpretation = 'Delete pressure: rows removed from Azure Tables by cleanup or reconciliation work.';
    } else if (lower.includes('processed') || lower.includes('work item') || lower.includes('work/min')) {
        interpretation = 'Workload signal: logical items completed by cron work, used to compare useful output against churn.';
    } else if (lower.includes('runtime') || lower.includes('duration') || lower.startsWith('avg ') || lower.includes('/min') || lower.includes('per minute')) {
        interpretation = 'Runtime signal: elapsed cron time or throughput, useful for spotting slow tasks and efficiency changes.';
    } else if (lower.includes('recipient') || lower.includes('report')) {
        interpretation = 'Report signal: email/report dispatch state or recipient volume for report jobs.';
    } else if (lower.includes('lane:') || LANE_ORDER.some((lane) => lower.includes(formatLaneLabel(lane).toLowerCase()))) {
        interpretation = 'Lane signal: the scheduler lane that owns this task, used to understand priority and contention.';
    } else if (/^\d+(\.\d+)?h$/.test(lower)) {
        interpretation = 'Schedule cadence: how often this task is expected to run.';
    } else if (/^\d+ total$/.test(lower) || lower.includes('run')) {
        interpretation = 'Execution count: how many cron runs are represented by this badge.';
    } else if (lower === 'scheduled') {
        interpretation = 'Trigger source: this run came from the automatic scheduler.';
    } else if (lower === 'system' || lower === 'global' || lower.includes('scope')) {
        interpretation = 'Scope: the organization, system, or execution scope this cron record applies to.';
    } else {
        interpretation = `Badge meaning: ${label}. Hover context helps interpret this cron signal.`;
    }

    const context = normalizeBadgeText(existingTitle);
    if (context && context !== label && !context.toLowerCase().startsWith('action signal:') && !context.toLowerCase().startsWith('health signal:') && !context.toLowerCase().startsWith('badge meaning:')) {
        return `${interpretation}\nContext: ${context}`;
    }

    return interpretation;
};

const applyCronBadgeTooltips = (root) => {
    if (!root) return;

    root.querySelectorAll('.badge').forEach((badge) => {
        const label = normalizeBadgeText(badge.textContent);
        if (!label) return;

        if (!Object.prototype.hasOwnProperty.call(badge.dataset, 'cronBadgeOriginalTitle')) {
            badge.dataset.cronBadgeOriginalTitle = badge.getAttribute('title') || '';
        }

        const tooltip = getCronBadgeInterpretation(label, badge.dataset.cronBadgeOriginalTitle);
        if (!tooltip) return;

        badge.setAttribute('title', tooltip);
        badge.setAttribute('aria-label', tooltip);
        badge.dataset.cronBadgeTooltip = 'true';
    });
};

const formatSampleWindow = (rangeDays) => {
    const days = Math.max(1, Number(rangeDays || 7));
    return days === 1 ? 'Last 24h' : `Last ${days}d`;
};

const getCronChurnWindowOption = (windowKey) => CRON_CHURN_WINDOW_OPTIONS.find((option) => option.key === windowKey)
    || CRON_CHURN_WINDOW_OPTIONS.find((option) => option.key === CRON_CHURN_DEFAULT_WINDOW_KEY)
    || CRON_CHURN_WINDOW_OPTIONS[0];

const getCronChurnFocusOption = (focusKey) => CRON_CHURN_FOCUS_OPTIONS.find((option) => option.key === focusKey)
    || CRON_CHURN_FOCUS_OPTIONS.find((option) => option.key === CRON_CHURN_DEFAULT_FOCUS_KEY)
    || CRON_CHURN_FOCUS_OPTIONS[0];

const getCronChurnCostModeOption = (costModeKey) => CRON_CHURN_COST_MODE_OPTIONS.find((option) => option.key === costModeKey)
    || CRON_CHURN_COST_MODE_OPTIONS.find((option) => option.key === CRON_CHURN_DEFAULT_COST_MODE_KEY)
    || CRON_CHURN_COST_MODE_OPTIONS[0];

const isManualRecoveryCronRun = (source = {}) => {
    const triggerSource = String(source.triggerSource || '').trim().toLowerCase();
    const laneId = String(source.laneId || '').trim().toLowerCase();
    if (laneId === 'manual') return true;
    if (!triggerSource) return false;
    return triggerSource !== 'schedule'
        && triggerSource !== 'scheduled'
        && triggerSource !== 'system'
        && triggerSource !== 'scheduler';
};

const formatCronChurnWindowLabel = (option) => option?.monthToDate ? 'This month' : formatSampleWindow(option?.days || 7);

const getCronChurnWindowCutoff = (option, lastHour) => {
    if (!lastHour) return null;

    if (option?.monthToDate) {
        return new Date(Date.UTC(lastHour.getUTCFullYear(), lastHour.getUTCMonth(), 1, 0, 0, 0));
    }

    const safeDays = Math.min(CRON_CHURN_FETCH_DAYS, Math.max(1, Number(option?.days || 7)));
    return new Date(lastHour.getTime() - (((safeDays * 24) - 1) * 60 * 60 * 1000));
};

const getTaskIdFromEvent = (event) => {
    const meta = event?.metadata || {};
    const explicitTaskId = meta.taskId || meta.TaskId || meta.taskName || meta.TaskName || meta.jobId || meta.JobId;
    if (explicitTaskId) return String(explicitTaskId);

    const targetType = String(event?.targetType || '').trim();
    const syntheticTargets = new Set(['All', 'CronLane', 'System', 'Scheduled', 'Manual']);
    if (targetType && !syntheticTargets.has(targetType)) return targetType;

    return null;
};

const getCronVolumeTaskIdFromEvent = (event) => {
    const eventType = String(event?.eventType || '').toUpperCase();
    if (eventType === 'CRONRUN') return getTaskIdFromEvent(event);
    return DIRECT_CRON_EVENT_LABELS[eventType] || null;
};

const getMetricValueFromPoint = (point, metricKey, costModel) => {
    if (metricKey === 'estimatedTableCostUsd') return estimateCronRunCostUsd(point, costModel);
    if (metricKey === 'rowsRead') return point.rowsRead;
    if (metricKey === 'rowsWritten') return point.rowsWritten;
    if (metricKey === 'eventsProcessed') return point.eventsProcessed;
    return point.crudOps;
};

const getCronCostSplit = (source = {}) => {
    const crudOps = toNumber(source.crudOps);
    const explicitRegular = toNumber(source.regularCrudOps);
    const explicitManual = toNumber(source.manualRecoveryCrudOps);
    const durationMs = toNumber(source.durationMs);
    const explicitRegularDuration = toNumber(source.regularDurationMs);
    const explicitManualDuration = toNumber(source.manualRecoveryDurationMs);
    const hasExplicitCrudSplit = explicitRegular > 0 || explicitManual > 0;
    const hasExplicitDurationSplit = explicitRegularDuration > 0 || explicitManualDuration > 0;
    const manualRecovery = isManualRecoveryCronRun(source);

    return {
        regularCrudOps: hasExplicitCrudSplit ? explicitRegular : (manualRecovery ? 0 : crudOps),
        manualRecoveryCrudOps: hasExplicitCrudSplit ? explicitManual : (manualRecovery ? crudOps : 0),
        regularDurationMs: hasExplicitDurationSplit ? explicitRegularDuration : (manualRecovery ? 0 : durationMs),
        manualRecoveryDurationMs: hasExplicitDurationSplit ? explicitManualDuration : (manualRecovery ? durationMs : 0)
    };
};

const splitCronCost = (source = {}, costModel) => {
    const split = getCronCostSplit(source);
    const storageCost = estimateAzureTableOperationCostUsd(source.crudOps, costModel);
    const regularStorageCost = estimateAzureTableOperationCostUsd(split.regularCrudOps, costModel);
    const manualRecoveryStorageCost = estimateAzureTableOperationCostUsd(split.manualRecoveryCrudOps, costModel);
    const computeCost = estimateContainerAppComputeCostUsd(source.durationMs, costModel);
    const regularComputeCost = estimateContainerAppComputeCostUsd(split.regularDurationMs, costModel);
    const manualRecoveryComputeCost = estimateContainerAppComputeCostUsd(split.manualRecoveryDurationMs, costModel);

    return {
        storageCost,
        regularStorageCost,
        manualRecoveryStorageCost,
        computeCost,
        regularComputeCost,
        manualRecoveryComputeCost,
        totalCost: storageCost + computeCost,
        regularTotalCost: regularStorageCost + regularComputeCost,
        manualRecoveryTotalCost: manualRecoveryStorageCost + manualRecoveryComputeCost
    };
};

const formatAuditChurnMetricValue = (value, metricKey) => metricKey === 'estimatedTableCostUsd'
    ? formatUsd(value)
    : formatCompactNumber(value);

const buildAccumulatedCostSeries = (points, costModel) => {
    let accumulatedCost = 0;
    let accumulatedStorageCost = 0;
    let accumulatedComputeCost = 0;
    let regularAccumulatedCost = 0;
    let regularAccumulatedStorageCost = 0;
    let regularAccumulatedComputeCost = 0;
    let manualRecoveryAccumulatedCost = 0;
    let manualRecoveryAccumulatedStorageCost = 0;
    let manualRecoveryAccumulatedComputeCost = 0;

    return points.map((point) => {
        const costs = splitCronCost(point, costModel);
        const hourCost = costs.totalCost;
        const hourStorageCost = costs.storageCost;
        const hourComputeCost = costs.computeCost;
        const regularHourCost = costs.regularTotalCost;
        const regularHourStorageCost = costs.regularStorageCost;
        const regularHourComputeCost = costs.regularComputeCost;
        const manualRecoveryHourCost = costs.manualRecoveryTotalCost;
        const manualRecoveryHourStorageCost = costs.manualRecoveryStorageCost;
        const manualRecoveryHourComputeCost = costs.manualRecoveryComputeCost;
        accumulatedCost += hourCost;
        accumulatedStorageCost += hourStorageCost;
        accumulatedComputeCost += hourComputeCost;
        regularAccumulatedCost += regularHourCost;
        regularAccumulatedStorageCost += regularHourStorageCost;
        regularAccumulatedComputeCost += regularHourComputeCost;
        manualRecoveryAccumulatedCost += manualRecoveryHourCost;
        manualRecoveryAccumulatedStorageCost += manualRecoveryHourStorageCost;
        manualRecoveryAccumulatedComputeCost += manualRecoveryHourComputeCost;

        return {
            hourCost,
            hourStorageCost,
            hourComputeCost,
            accumulatedCost,
            accumulatedStorageCost,
            accumulatedComputeCost,
            regularHourCost,
            regularHourStorageCost,
            regularHourComputeCost,
            regularAccumulatedCost,
            regularAccumulatedStorageCost,
            regularAccumulatedComputeCost,
            manualRecoveryHourCost,
            manualRecoveryHourStorageCost,
            manualRecoveryHourComputeCost,
            manualRecoveryAccumulatedCost,
            manualRecoveryAccumulatedStorageCost,
            manualRecoveryAccumulatedComputeCost,
            averageRunCost: point.auditEvents > 0 ? hourCost / point.auditEvents : 0
        };
    });
};

const floorToUtcHour = (date) => new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours()
));

const formatHourLabel = (date) => date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric'
});

const formatHourTickLabel = (date, index) => {
    if (index === 0 || date.getUTCHours() === 0) {
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }

    if (date.getUTCHours() % 6 === 0) {
        return date.toLocaleTimeString(undefined, { hour: 'numeric' });
    }

    return '';
};

const formatAxisDateTimeLabel = (value) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    return [
        date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        date.toLocaleTimeString(undefined, { hour: 'numeric' })
    ];
};

const normalizeCronChurnScope = (executionScope) => String(executionScope || 'global').trim().toLowerCase() || 'global';
const normalizeCronChurnLane = (laneId) => String(laneId || '').trim().toLowerCase();
const buildCronChurnTaskKey = (taskId, laneId, executionScope) => [
    String(taskId || 'Unassigned'),
    normalizeCronChurnLane(laneId),
    normalizeCronChurnScope(executionScope)
].join('|');
const formatCronChurnSeriesLabel = (taskId, laneId, executionScope) => {
    const baseLabel = formatCronTaskLabel(taskId);
    const normalizedScope = normalizeCronChurnScope(executionScope);
    const normalizedLane = normalizeCronChurnLane(laneId);
    const suffixes = [];
    if (normalizedScope !== 'global') suffixes.push(formatExecutionScope(normalizedScope));
    if (normalizedLane) suffixes.push(formatLaneLabel(normalizedLane));
    return suffixes.length > 0 ? `${baseLabel} · ${suffixes.join(' · ')}` : baseLabel;
};

const createEmptyCronChurnTaskPoint = (taskId, label, options = {}) => ({
    taskKey: options.taskKey || buildCronChurnTaskKey(taskId, options.laneId, options.executionScope),
    taskId,
    laneId: options.laneId || '',
    executionScope: options.executionScope || 'global',
    triggerSource: options.triggerSource || '',
    label,
    auditEvents: 0,
    durationMs: 0,
    regularDurationMs: 0,
    manualRecoveryDurationMs: 0,
    eventsProcessed: 0,
    rowsRead: 0,
    rowsCreated: 0,
    rowsUpdated: 0,
    rowsWritten: 0,
    rowsDeleted: 0,
    crudOps: 0,
    regularCrudOps: 0,
    manualRecoveryCrudOps: 0
});

const addCronChurnMetrics = (target, source) => {
    target.auditEvents += toNumber(source?.auditEvents);
    target.durationMs += toNumber(source?.durationMs);
    target.regularDurationMs += toNumber(source?.regularDurationMs);
    target.manualRecoveryDurationMs += toNumber(source?.manualRecoveryDurationMs);
    target.eventsProcessed += toNumber(source?.eventsProcessed);
    target.rowsRead += toNumber(source?.rowsRead);
    target.rowsCreated += toNumber(source?.rowsCreated);
    target.rowsUpdated += toNumber(source?.rowsUpdated);
    target.rowsWritten += toNumber(source?.rowsWritten);
    target.rowsDeleted += toNumber(source?.rowsDeleted);
    target.crudOps += toNumber(source?.crudOps);
    target.regularCrudOps += toNumber(source?.regularCrudOps);
    target.manualRecoveryCrudOps += toNumber(source?.manualRecoveryCrudOps);
};

const isCronChurnTaskInFocus = (taskPoint, focus) => {
    if (!focus || focus.key === 'all') return true;

    const laneId = String(taskPoint?.laneId || '').toLowerCase();
    const taskId = String(taskPoint?.taskId || '');
    const laneMatch = Array.isArray(focus.laneIds)
        && focus.laneIds.some((candidate) => String(candidate).toLowerCase() === laneId);
    const taskMatch = Array.isArray(focus.taskIds)
        && focus.taskIds.some((candidate) => candidate.toLowerCase() === taskId.toLowerCase());

    return laneMatch || taskMatch;
};

const applyCronChurnFocusToPoints = (points, focusKey) => {
    const focus = getCronChurnFocusOption(focusKey);
    if (focus.key === 'all') return { points, focus };

    const focusedPoints = points.map((point) => {
        const byTask = new Map();
        const focusedTotals = createEmptyCronChurnTaskPoint('__focus_total__', 'Focus total');

        for (const [taskKey, taskPoint] of point.byTask.entries()) {
            if (!isCronChurnTaskInFocus(taskPoint, focus)) continue;
            byTask.set(taskKey, taskPoint);
            addCronChurnMetrics(focusedTotals, taskPoint);
        }

        return {
            ...point,
            auditEvents: focusedTotals.auditEvents,
            durationMs: focusedTotals.durationMs,
            regularDurationMs: focusedTotals.regularDurationMs,
            manualRecoveryDurationMs: focusedTotals.manualRecoveryDurationMs,
            eventsProcessed: focusedTotals.eventsProcessed,
            rowsRead: focusedTotals.rowsRead,
            rowsCreated: focusedTotals.rowsCreated,
            rowsUpdated: focusedTotals.rowsUpdated,
            rowsWritten: focusedTotals.rowsWritten,
            rowsDeleted: focusedTotals.rowsDeleted,
            crudOps: focusedTotals.crudOps,
            regularCrudOps: focusedTotals.regularCrudOps,
            manualRecoveryCrudOps: focusedTotals.manualRecoveryCrudOps,
            byTask
        };
    });

    return { points: focusedPoints, focus };
};

const hasCronChurnVolume = (point) => [
    point.auditEvents,
    point.eventsProcessed,
    point.rowsRead,
    point.rowsCreated,
    point.rowsUpdated,
    point.rowsWritten,
    point.rowsDeleted,
    point.crudOps
].some((value) => toNumber(value) > 0);

const buildOtherCronChurnTask = (points, selectedTaskKeys) => {
    const selected = new Set(selectedTaskKeys);
    const total = createEmptyCronChurnTaskPoint(OTHER_CRON_TASK_ID, OTHER_CRON_TASK_LABEL);
    const otherPoints = points.map((point) => {
        const used = createEmptyCronChurnTaskPoint(OTHER_CRON_TASK_ID, OTHER_CRON_TASK_LABEL);
        for (const taskKey of selected) {
            addCronChurnMetrics(used, point.byTask.get(taskKey));
        }

        const residual = {
            taskKey: OTHER_CRON_TASK_ID,
            taskId: OTHER_CRON_TASK_ID,
            laneId: '',
            executionScope: 'global',
            label: OTHER_CRON_TASK_LABEL,
            auditEvents: Math.max(0, point.auditEvents - used.auditEvents),
            durationMs: Math.max(0, point.durationMs - used.durationMs),
            regularDurationMs: Math.max(0, point.regularDurationMs - used.regularDurationMs),
            manualRecoveryDurationMs: Math.max(0, point.manualRecoveryDurationMs - used.manualRecoveryDurationMs),
            eventsProcessed: Math.max(0, point.eventsProcessed - used.eventsProcessed),
            rowsRead: Math.max(0, point.rowsRead - used.rowsRead),
            rowsCreated: Math.max(0, point.rowsCreated - used.rowsCreated),
            rowsUpdated: Math.max(0, point.rowsUpdated - used.rowsUpdated),
            rowsWritten: Math.max(0, point.rowsWritten - used.rowsWritten),
            rowsDeleted: Math.max(0, point.rowsDeleted - used.rowsDeleted),
            crudOps: Math.max(0, point.crudOps - used.crudOps),
            regularCrudOps: Math.max(0, point.regularCrudOps - used.regularCrudOps),
            manualRecoveryCrudOps: Math.max(0, point.manualRecoveryCrudOps - used.manualRecoveryCrudOps)
        };

        addCronChurnMetrics(total, residual);
        return residual;
    });

    return { ...total, color: OTHER_CRON_TASK_COLOR, points: otherPoints };
};

const buildCronChurnTaskSeries = (points) => {
    const taskTotals = new Map();
    for (const point of points) {
        for (const taskPoint of point.byTask.values()) {
            const existing = taskTotals.get(taskPoint.taskKey) || createEmptyCronChurnTaskPoint(taskPoint.taskId, taskPoint.label, taskPoint);
            addCronChurnMetrics(existing, taskPoint);
            taskTotals.set(taskPoint.taskKey, existing);
        }
    }

    const sortedTasks = Array.from(taskTotals.values())
        .sort((a, b) => (b.crudOps - a.crudOps) || (b.eventsProcessed - a.eventsProcessed) || a.label.localeCompare(b.label));

    let selectedTasks = sortedTasks.slice(0, AUDIT_CHURN_SERIES_LIMIT);
    let otherTask = buildOtherCronChurnTask(points, selectedTasks.map((task) => task.taskKey));
    if (hasCronChurnVolume(otherTask) && selectedTasks.length >= AUDIT_CHURN_SERIES_LIMIT) {
        selectedTasks = sortedTasks.slice(0, AUDIT_CHURN_SERIES_LIMIT - 1);
        otherTask = buildOtherCronChurnTask(points, selectedTasks.map((task) => task.taskKey));
    }

    const tasks = selectedTasks.map((task, index) => ({
        ...task,
        color: AUDIT_CHURN_COLORS[index % AUDIT_CHURN_COLORS.length],
        points: points.map((point) => point.byTask.get(task.taskKey) || createEmptyCronChurnTaskPoint(task.taskId, task.label, task))
    }));

    if (hasCronChurnVolume(otherTask)) {
        tasks.push(otherTask);
    }

    return tasks;
};

const getCronChurnTaskSignals = (task) => {
    const processed = toNumber(task?.eventsProcessed);
    const reads = toNumber(task?.rowsRead);
    const writes = toNumber(task?.rowsWritten);
    const deletes = toNumber(task?.rowsDeleted);
    const crudOps = toNumber(task?.crudOps);
    const runs = toNumber(task?.auditEvents);
    const signals = [];

    if (task?.taskId === OTHER_CRON_TASK_ID) {
        signals.push({
            tone: 'info',
            title: 'Aggregated residual series',
            description: 'This card covers churn that exists in hourly totals but was not retained as detailed task series in compact snapshots.'
        });
    }

    if (processed > 0 && reads / processed >= 10) {
        signals.push({
            tone: 'warning',
            title: 'Reads are high for the work processed',
            description: 'Check for broad table scans, missing partition filters, or repeated lookups that do not change the workload count.'
        });
    }

    if (processed > 0 && writes / processed >= 5) {
        signals.push({
            tone: 'warning',
            title: 'Writes are high for the work processed',
            description: 'Look for rows being re-dirtied or rewritten every run instead of settling after the first pass.'
        });
    }

    if (processed === 0 && crudOps > 0) {
        signals.push({
            tone: 'danger',
            title: 'Storage churn without processed work',
            description: 'The job touched storage without reporting logical work. This is usually worth investigating first.'
        });
    }

    if (deletes > 0) {
        signals.push({
            tone: 'info',
            title: 'Deletes occurred',
            description: 'Deletes are normal for cleanup jobs, but unexpected delete spikes should be checked against the job purpose.'
        });
    }

    if (signals.length === 0) {
        signals.push({
            tone: 'success',
            title: 'No obvious churn smell in this window',
            description: 'Reads, writes, and processed volume do not show a clear mismatch. Compare against prior windows before calling it healthy.'
        });
    }

    return signals.map((signal) => ({
        ...signal,
        badgeClass: signal.tone === 'danger'
            ? 'bg-danger-lt text-danger'
            : signal.tone === 'warning'
                ? 'bg-warning-lt text-warning'
                : signal.tone === 'success'
                    ? 'bg-success-lt text-success'
                    : 'bg-info-lt text-info'
    }));
};

const getCronChurnTaskHealth = (task) => {
    const signals = getCronChurnTaskSignals(task);
    if (signals.some((signal) => signal.tone === 'danger')) {
        return { tone: 'danger', progressClass: 'cron-audit-progress--danger', label: 'Bad churn pattern' };
    }

    if (signals.some((signal) => signal.tone === 'warning')) {
        return { tone: 'warning', progressClass: 'cron-audit-progress--warning', label: 'Suspicious churn pattern' };
    }

    if (task?.taskId === OTHER_CRON_TASK_ID) {
        return { tone: 'info', progressClass: 'cron-audit-progress--info', label: 'Aggregated residual churn' };
    }

    return { tone: 'success', progressClass: 'cron-audit-progress--success', label: 'No obvious churn smell' };
};

const buildHourlyCronChurnTrendFromApi = (trend, auditChurnMetric, chartThemeVersion, windowKey = CRON_CHURN_DEFAULT_WINDOW_KEY, focusKey = CRON_CHURN_DEFAULT_FOCUS_KEY) => {
    const apiPoints = Array.isArray(trend?.points) ? trend.points : [];
    if (apiPoints.length === 0) return null;
    const costModel = normalizeCronCostModel(trend?.costModel);

    const allPoints = apiPoints.map((point, index) => {
        const hour = point?.hourUtc ? new Date(point.hourUtc) : null;
        const safeHour = hour && !Number.isNaN(hour.getTime()) ? hour : new Date();
        const totals = point?.totals || {};
        const bucket = {
            key: safeHour.toISOString(),
            hour: safeHour,
            label: formatHourLabel(safeHour),
            tickLabel: formatHourTickLabel(safeHour, index),
            auditEvents: toNumber(totals.runs),
            durationMs: toNumber(totals.durationMs),
            regularDurationMs: toNumber(totals.regularDurationMs),
            manualRecoveryDurationMs: toNumber(totals.manualRecoveryDurationMs),
            eventsProcessed: toNumber(totals.eventsProcessed),
            rowsRead: toNumber(totals.rowsRead),
            rowsCreated: toNumber(totals.rowsCreated),
            rowsUpdated: toNumber(totals.rowsUpdated),
            rowsWritten: toNumber(totals.rowsWritten),
            rowsDeleted: toNumber(totals.rowsDeleted),
            crudOps: toNumber(totals.crudOps),
            regularCrudOps: toNumber(totals.regularCrudOps),
            manualRecoveryCrudOps: toNumber(totals.manualRecoveryCrudOps),
            byTask: new Map()
        };

        for (const task of point?.tasks || []) {
            const taskId = String(task?.taskId || 'Unassigned');
            const laneId = String(task?.laneId || '');
            const executionScope = normalizeCronChurnScope(task?.executionScope);
            const triggerSource = String(task?.triggerSource || '');
            const taskKey = buildCronChurnTaskKey(taskId, laneId, executionScope);
            const crudOps = toNumber(task?.crudOps);
            const durationMs = toNumber(task?.durationMs);
            const split = getCronCostSplit({
                taskId,
                laneId,
                triggerSource,
                crudOps,
                durationMs,
                regularCrudOps: task?.regularCrudOps,
                manualRecoveryCrudOps: task?.manualRecoveryCrudOps,
                regularDurationMs: task?.regularDurationMs,
                manualRecoveryDurationMs: task?.manualRecoveryDurationMs
            });
            bucket.byTask.set(taskKey, {
                taskKey,
                taskId,
                laneId,
                executionScope,
                triggerSource,
                label: formatCronChurnSeriesLabel(taskId, laneId, executionScope),
                auditEvents: toNumber(task?.runs),
                durationMs,
                regularDurationMs: split.regularDurationMs,
                manualRecoveryDurationMs: split.manualRecoveryDurationMs,
                eventsProcessed: toNumber(task?.eventsProcessed),
                rowsRead: toNumber(task?.rowsRead),
                rowsCreated: toNumber(task?.rowsCreated),
                rowsUpdated: toNumber(task?.rowsUpdated),
                rowsWritten: toNumber(task?.rowsWritten),
                rowsDeleted: toNumber(task?.rowsDeleted),
                crudOps,
                regularCrudOps: split.regularCrudOps,
                manualRecoveryCrudOps: split.manualRecoveryCrudOps
            });
        }

        const taskSplitTotals = Array.from(bucket.byTask.values()).reduce((acc, taskPoint) => {
            acc.regularCrudOps += toNumber(taskPoint.regularCrudOps);
            acc.manualRecoveryCrudOps += toNumber(taskPoint.manualRecoveryCrudOps);
            acc.regularDurationMs += toNumber(taskPoint.regularDurationMs);
            acc.manualRecoveryDurationMs += toNumber(taskPoint.manualRecoveryDurationMs);
            return acc;
        }, { regularCrudOps: 0, manualRecoveryCrudOps: 0, regularDurationMs: 0, manualRecoveryDurationMs: 0 });
        if (bucket.crudOps > 0 && bucket.regularCrudOps === 0 && bucket.manualRecoveryCrudOps === 0) {
            bucket.regularCrudOps = taskSplitTotals.regularCrudOps;
            bucket.manualRecoveryCrudOps = taskSplitTotals.manualRecoveryCrudOps;
            const unattributedCrudOps = Math.max(0, bucket.crudOps - bucket.regularCrudOps - bucket.manualRecoveryCrudOps);
            bucket.regularCrudOps += unattributedCrudOps;
        }
        if (bucket.durationMs > 0 && bucket.regularDurationMs === 0 && bucket.manualRecoveryDurationMs === 0) {
            bucket.regularDurationMs = taskSplitTotals.regularDurationMs;
            bucket.manualRecoveryDurationMs = taskSplitTotals.manualRecoveryDurationMs;
            const unattributedDurationMs = Math.max(0, bucket.durationMs - bucket.regularDurationMs - bucket.manualRecoveryDurationMs);
            bucket.regularDurationMs += unattributedDurationMs;
        }

        return bucket;
    });

    const sortedPoints = allPoints.sort((left, right) => left.hour - right.hour);
    const selectedWindow = getCronChurnWindowOption(windowKey);
    const lastHour = sortedPoints[sortedPoints.length - 1]?.hour;
    const cutoff = getCronChurnWindowCutoff(selectedWindow, lastHour);
    const windowedPoints = cutoff
        ? sortedPoints.filter((point) => point.hour >= cutoff)
        : sortedPoints;
    const { points, focus } = applyCronChurnFocusToPoints(windowedPoints, focusKey);

    const tasks = buildCronChurnTaskSeries(points);

    const totals = points.reduce((acc, point) => {
        acc.auditEvents += point.auditEvents;
        acc.durationMs += point.durationMs;
        acc.regularDurationMs += point.regularDurationMs;
        acc.manualRecoveryDurationMs += point.manualRecoveryDurationMs;
        acc.eventsProcessed += point.eventsProcessed;
        acc.rowsRead += point.rowsRead;
        acc.rowsCreated += point.rowsCreated;
        acc.rowsUpdated += point.rowsUpdated;
        acc.rowsWritten += point.rowsWritten;
        acc.rowsDeleted += point.rowsDeleted;
        acc.crudOps += point.crudOps;
        acc.regularCrudOps += point.regularCrudOps;
        acc.manualRecoveryCrudOps += point.manualRecoveryCrudOps;
        return acc;
    }, { auditEvents: 0, durationMs: 0, regularDurationMs: 0, manualRecoveryDurationMs: 0, eventsProcessed: 0, rowsRead: 0, rowsCreated: 0, rowsUpdated: 0, rowsWritten: 0, rowsDeleted: 0, crudOps: 0, regularCrudOps: 0, manualRecoveryCrudOps: 0 });

    const selectedMetric = AUDIT_CHURN_METRICS.find((metric) => metric.key === auditChurnMetric) || AUDIT_CHURN_METRICS[0];
    const maxCrudOps = Math.max(1, ...tasks.map((task) => task.crudOps));
    const spanLabel = points.length === 1
        ? points[0].label
        : `${points[0].label} - ${points[points.length - 1].label}`;
    const windowLabel = formatCronChurnWindowLabel(selectedWindow);
    const sourceLabel = `${focus.shortLabel} · ${windowLabel} · cached ${formatSampleWindow(CRON_CHURN_FETCH_DAYS)} · ${trend?.fallbackMetricRows > 0 && trend?.snapshotDays === 0
        ? 'CronRunMetrics backfill source'
        : 'CronRuns projection snapshots + delta'}`;
    const chartKey = JSON.stringify({
        source: 'cronRunsProjection',
        windowKey: selectedWindow.key,
        focusKey: focus.key,
        metric: selectedMetric.key,
        theme: chartThemeVersion,
        generatedAtUtc: trend?.generatedAtUtc,
        labels: points.map((point) => point.key),
        tasks: tasks.map((task) => ({
            taskId: task.taskKey || task.taskId,
            data: task.points.map((point) => getMetricValueFromPoint(point, selectedMetric.key, costModel))
        }))
    });

    return { points, tasks, maxCrudOps, spanLabel, sourceLabel, selectedMetric, chartKey, totals, eventNoun: 'cron run', focus, costModel };
};

export function CronActivityPage({ cronStatus: propCronStatus, showHeader = true, embedded = false }) {
    const [loading, setLoading] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [events, setEvents] = useState([]);
    const [rangeDays, setRangeDays] = useState(7);
    const [hasMore, setHasMore] = useState(false);
    const [continuationToken, setContinuationToken] = useState(null);
    const scrollObserverRef = useRef(null);
    const cronActivityRootRef = useRef(null);
    const auditChurnCanvasRef = useRef(null);
    const auditChurnChartRef = useRef(null);
    const [filterJob, setFilterJob] = useState('all'); // 'all', 'CronExecution', 'ReportSent', 'ReportFailed', 'BatchComplete'
    const [filterStatus, setFilterStatus] = useState('all');
    const [filterOrg, setFilterOrg] = useState('');
    const [auditChurnMetric, setAuditChurnMetric] = useState('crudOps');
    const [showCronChurnCost, setShowCronChurnCost] = useState(true);
    const [cronChurnCostModeKey, setCronChurnCostModeKey] = useState(CRON_CHURN_DEFAULT_COST_MODE_KEY);
    const [chartThemeVersion, setChartThemeVersion] = useState(0);
    const [expandedEvents, setExpandedEvents] = useState(new Set());
    const [cronStatus, setCronStatus] = useState(propCronStatus || null);
    const [loadingCronStatus, setLoadingCronStatus] = useState(false);
    const [cronChurnTrend, setCronChurnTrend] = useState(null);
    const [cronChurnWindowKey, setCronChurnWindowKey] = useState(CRON_CHURN_DEFAULT_WINDOW_KEY);
    const [cronChurnFocusKey, setCronChurnFocusKey] = useState(CRON_CHURN_DEFAULT_FOCUS_KEY);
    const [loadingCronChurnTrend, setLoadingCronChurnTrend] = useState(false);
    const [cronChurnHelpOpen, setCronChurnHelpOpen] = useState(false);
    const [selectedCronChurnTask, setSelectedCronChurnTask] = useState(null);
    const [highlightedEventId, setHighlightedEventId] = useState(null);
    const [highlightedPartitionKey, setHighlightedPartitionKey] = useState(null);
    const [highlightedRowKey, setHighlightedRowKey] = useState(null);
    const [selectedAuditEvent, setSelectedAuditEvent] = useState(null);
    const [loadingSelectedAuditEvent, setLoadingSelectedAuditEvent] = useState(false);

    // Trace Viewer modal state
    const [traceModalOpen, setTraceModalOpen] = useState(false);
    const [tracePartitionKey, setTracePartitionKey] = useState('');
    const [traceTracingId, setTraceTracingId] = useState('');
    const [traceLogs, setTraceLogs] = useState([]);
    const [traceLoading, setTraceLoading] = useState(false);
    const [traceError, setTraceError] = useState('');
    const [traceSortCol, setTraceSortCol] = useState('rowKey');
    const [traceSortDir, setTraceSortDir] = useState('asc');
    const [traceExpandedRows, setTraceExpandedRows] = useState(new Set());
    const [traceExpandedField, setTraceExpandedField] = useState(null); // {rowKey, field}

    const parseHashQuery = () => {
        const hash = window.location.hash || '';
        const queryIndex = hash.indexOf('?');
        if (queryIndex < 0) {
            return new URLSearchParams();
        }

        return new URLSearchParams(hash.substring(queryIndex + 1));
    };

    useEffect(() => {
        const observer = new MutationObserver(() => setChartThemeVersion((value) => value + 1));
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-bs-theme'] });
        return () => observer.disconnect();
    }, []);

    // Infinite scroll observer
    useEffect(() => {
        const observerTarget = scrollObserverRef.current;
        if (!observerTarget) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
                    loadMore();
                }
            },
            { threshold: 0.1, rootMargin: '100px' }
        );

        observer.observe(observerTarget);
        return () => observer.disconnect();
    }, [hasMore, loading, loadingMore]);

    useEffect(() => {
        const query = parseHashQuery();
        const eventId = query.get('eventId');
        const date = query.get('date') || query.get('partitionKey');
        const eventKey = query.get('eventKey') || query.get('rowKey');

        if (eventId) {
            setHighlightedEventId(eventId);
            setHighlightedPartitionKey(date);
            setHighlightedRowKey(eventKey);
            setFilterJob('CronExecution');
        }

        loadCronStatus();
        const retryTimer = window.setTimeout(() => {
            loadCronStatus();
        }, 2500);

        return () => window.clearTimeout(retryTimer);
    }, []);

    useEffect(() => {
        if (!highlightedEventId) {
            setSelectedAuditEvent(null);
            return;
        }

        let disposed = false;
        const loadSelectedAuditEvent = async () => {
            try {
                setLoadingSelectedAuditEvent(true);
                const response = await api.adminGetAuditEvent(highlightedEventId, {
                    date: highlightedPartitionKey,
                    eventKey: highlightedRowKey
                });

                if (disposed) {
                    return;
                }

                if (response?.success && response?.data) {
                    setSelectedAuditEvent(response.data);
                } else {
                    setSelectedAuditEvent(null);
                }
            } catch (err) {
                logger.error('[Cron Activity] Error loading selected audit event:', err);
                if (!disposed) {
                    setSelectedAuditEvent(null);
                }
            } finally {
                if (!disposed) {
                    setLoadingSelectedAuditEvent(false);
                }
            }
        };

        loadSelectedAuditEvent();
        return () => {
            disposed = true;
        };
    }, [highlightedEventId, highlightedPartitionKey, highlightedRowKey]);

    useEffect(() => {
        if (!highlightedEventId || !Array.isArray(events) || events.length === 0) {
            return;
        }

        const matched = events.find(e => e.eventId === highlightedEventId);
        if (!matched) {
            return;
        }

        setExpandedEvents((prev) => {
            if (prev.has(highlightedEventId)) {
                return prev;
            }

            const next = new Set(prev);
            next.add(highlightedEventId);
            return next;
        });

        window.setTimeout(() => {
            const row = document.getElementById(`cron-event-${highlightedEventId}`);
            row?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 50);
    }, [events, highlightedEventId]);

    useEffect(() => {
        loadCronEvents(true);
        const handler = () => {
            loadCronEvents(true);
        };
        const unsubscribe = orgContext.onChange(handler);
        window.addEventListener('orgChanged', handler);
        return () => {
            unsubscribe?.();
            window.removeEventListener('orgChanged', handler);
        };
    }, [rangeDays, filterJob, filterStatus, filterOrg]);

    useEffect(() => {
        loadCronChurnTrend();
    }, []);

    useEffect(() => {
        const root = cronActivityRootRef.current;
        if (!root) return;

        applyCronBadgeTooltips(root);
        const observer = new MutationObserver(() => applyCronBadgeTooltips(root));
        observer.observe(root, { childList: true, subtree: true, characterData: true });

        return () => observer.disconnect();
    }, [events, cronStatus, cronChurnTrend, expandedEvents, selectedAuditEvent, traceLogs, selectedCronChurnTask]);

    // Load cron status (registered tasks, schedules, execution history)
    async function loadCronStatus() {
        setLoadingCronStatus(true);
        try {
            const res = await api.adminGetCronStatus();
            if (res.success && res.data) {
                setCronStatus(res.data);
            } else {
                logger.warn('[Cron Activity] Failed to load cron status:', res.message);
                // Continue with events even if status fails
            }
        } catch (err) {
            logger.error('[Cron Activity] Error loading cron status:', err);
            // Continue with events even if status fails
        } finally {
            setLoadingCronStatus(false);
        }
    }

    async function loadCronChurnTrend() {
        setLoadingCronChurnTrend(true);
        try {
            const res = await api.adminGetCronChurn(CRON_CHURN_FETCH_DAYS);
            if (res.success && res.data) {
                setCronChurnTrend(res.data);
            } else {
                logger.warn('[Cron Activity] Failed to load cron churn trend:', res.message);
                setCronChurnTrend(null);
            }
        } catch (err) {
            logger.error('[Cron Activity] Error loading cron churn trend:', err);
            setCronChurnTrend(null);
        } finally {
            setLoadingCronChurnTrend(false);
        }
    }

    // Load more events (for infinite scroll)
    async function loadMore() {
        if (!continuationToken || !hasMore || loadingMore) return;
        logger.debug('[Cron Activity] Loading more events...');
        await loadCronEvents(false);
    }

    // Load cron events (initial or more)
    async function loadCronEvents(reset = true) {
        if (reset) {
            setLoading(true);
        } else {
            setLoadingMore(true);
        }
        try {
            const query = new URLSearchParams({
                cronActivity: 'true',
                pageSize: '100',
                days: rangeDays.toString()
            });

            if (!reset && continuationToken) {
                query.set('continuationToken', continuationToken);
            }

            const res = await api.get(`/api/v1/admin/audit?${query.toString()}`);
            if (res.success && res.data) {
                const list = res.data.events || [];
                const newEvents = reset ? list : (() => {
                    const existingIds = new Set(events.map(e => e.eventId));
                    return [...events, ...list.filter(e => !existingIds.has(e.eventId))];
                })();
                setEvents(newEvents);
                setHasMore(res.data.hasMore || false);
                setContinuationToken(res.data.continuationToken || null);
            } else {
                toast.show(res.message || 'Failed to load cron activity', 'error');
                if (reset) setEvents([]);
            }
        } catch (err) {
            logger.error('[Cron Activity] Error loading events:', err);
            toast.show('Failed to load cron activity', 'error');
            if (reset) setEvents([]);
        } finally {
            if (reset) {
                setLoading(false);
            } else {
                setLoadingMore(false);
            }
        }
    }

    function renderEventRow(e) {
        const ts = e.timestamp ? new Date(e.timestamp) : null;
        const isExpanded = expandedEvents.has(e.eventId);
        const meta = e.metadata || {};
        const eventType = String(e.eventType || '').toUpperCase();
        const subType = String(e.subType || '');
        const taskId = getTaskIdFromEvent(e) || e.targetType || '';
        const laneId = eventType === 'CRONRUN' ? getLaneIdForEvent(e, taskId) : null;
        const durationMs = getDurationMsFromEvent(e);
        const duration = durationMs > 0 ? formatDuration(durationMs) : '';
        const budget = getEventOperationBudget(e);
        const volume = getEventVolumeMetrics(e);
        const rowsRead = Math.max(budget.rowsRead, volume.rowsRead, volume.rowsScanned);
        const rowsWritten = Math.max(budget.rowsWritten, volume.rowsWritten);
        const rowsDeleted = Math.max(budget.rowsDeleted, volume.rowsDeleted);
        const rowOps = rowsRead + rowsWritten + rowsDeleted;
        const recipientCount = toNumber(meta.recipientCount);
        const itemsProcessed = toNumber(meta.itemsProcessed ?? meta.entriesRefreshed ?? volume.eventsProcessed);
        const successful = toNumber(meta.successful ?? meta.Successful);
        const failed = toNumber(meta.failed ?? meta.Failed);
        const diagnostics = getEventDiagnostics(e);
        const diagnosticsEntries = diagnostics && typeof diagnostics === 'object' ? Object.entries(diagnostics) : [];
        const status = (() => {
            const cronStatusValue = getCronEventStatus(e);
            if (cronStatusValue) return cronStatusValue;
            if (eventType === 'SECURITY_REPORT') return subType.toLowerCase().includes('failed') ? 'failed' : 'completed';
            return 'recorded';
        })();
        const statusMeta = (() => {
            if (['completed', 'success', 'sent', 'recorded'].includes(status)) return { label: status === 'recorded' ? 'Recorded' : 'OK', badgeClass: 'bg-success-lt text-success' };
            if (['running', 'queued'].includes(status)) return { label: status.charAt(0).toUpperCase() + status.slice(1), badgeClass: 'bg-info-lt text-info' };
            if (['failed', 'exception', 'rejected', 'partialfailure', 'cancelled', 'canceled', 'timedout'].includes(status)) return { label: 'Needs review', badgeClass: 'bg-danger-lt text-danger' };
            return { label: status.charAt(0).toUpperCase() + status.slice(1), badgeClass: 'bg-secondary-lt text-secondary' };
        })();
        const category = (() => {
            if (eventType === 'CRONRUN') {
                const isManual = subType === 'CronRunManual' || subType === 'Manual' || subType.toLowerCase().includes('manual');
                return {
                    label: isManual ? 'Manual' : 'Scheduled',
                    badgeClass: isManual ? 'bg-purple-lt text-purple' : 'bg-blue-lt text-blue',
                    icon: isManual ? 'ti-hand-click' : 'ti-player-play'
                };
            }

            if (eventType === 'SECURITY_REPORT') {
                const normalizedSubtype = subType.toLowerCase();
                if (normalizedSubtype.includes('failed')) return { label: 'Report failed', badgeClass: 'bg-red-lt text-danger', icon: 'ti-mail-x' };
                if (normalizedSubtype.includes('batch')) return { label: 'Report batch', badgeClass: 'bg-green-lt text-success', icon: 'ti-mail-check' };
                if (normalizedSubtype.includes('emailsent') || normalizedSubtype.includes('dispatchcomplete') || normalizedSubtype.endsWith('sent')) {
                    return { label: 'Report sent', badgeClass: 'bg-green-lt text-success', icon: 'ti-mail-check' };
                }

                return { label: 'Report', badgeClass: 'bg-green-lt text-success', icon: 'ti-mail' };
            }

            return { label: e.eventType || 'Audit', badgeClass: 'bg-primary-lt text-primary', icon: 'ti-clock' };
        })();
        const signalPills = [
            meta.tier ? { label: meta.tier, badgeClass: 'bg-purple-lt text-purple' } : null,
            duration ? { label: duration, badgeClass: 'bg-primary-lt text-primary' } : null,
            rowOps > 0 ? { label: `${formatCompactNumber(rowOps)} ops`, badgeClass: 'bg-warning-lt text-warning' } : null,
            itemsProcessed > 0 ? { label: `${formatCompactNumber(itemsProcessed)} work`, badgeClass: 'bg-success-lt text-success' } : null,
            recipientCount > 0 ? { label: `${formatCompactNumber(recipientCount)} recipients`, badgeClass: 'bg-info-lt text-info' } : null,
            failed > 0 ? { label: `${formatCompactNumber(failed)} failed`, badgeClass: 'bg-danger-lt text-danger' } : null,
            successful > 0 ? { label: `${formatCompactNumber(successful)} ok`, badgeClass: 'bg-success-lt text-success' } : null
        ].filter(Boolean);
        const metricsTooltip = [
            duration ? `Duration: ${duration}` : null,
            rowOps > 0 ? `Rows: ${formatCompactNumber(rowsRead)} read/scanned, ${formatCompactNumber(rowsWritten)} written, ${formatCompactNumber(rowsDeleted)} deleted` : null,
            itemsProcessed > 0 ? `Work items: ${formatCompactNumber(itemsProcessed)}` : null,
            recipientCount > 0 ? `Recipients: ${formatCompactNumber(recipientCount)}` : null,
            failed > 0 ? `Failures: ${formatCompactNumber(failed)}` : null
        ].filter(Boolean).join('\n');
        const description = e.description || meta.message || meta.stage || '-';
        const title = taskId || e.targetId || category.label;
        const scopeLabel = e.orgId || 'SYSTEM';
        const targetLabel = e.targetId || meta.scopeKey || meta.tenantId || '';
        const targetDuplicatesLane = targetLabel && laneId && normalizeLaneId(targetLabel) === laneId;
        const requestId = meta.RequestId || meta.requestId || meta.correlationId;
        const isHighlighted = highlightedEventId && highlightedEventId === e.eventId;

        return html`
            <tr id=${`cron-event-${e.eventId}`} class=${`activity-row cursor-pointer ${isHighlighted ? 'table-warning' : ''} ${isExpanded ? 'activity-row-expanded' : ''}`} onClick=${() => {
                const newSet = new Set(expandedEvents);
                if (isExpanded) newSet.delete(e.eventId);
                else newSet.add(e.eventId);
                setExpandedEvents(newSet);
            }}>
                <td class="cron-activity-main-cell">
                    <div class="d-flex align-items-start gap-2 min-w-0">
                        <span class=${`cron-event-icon ${category.badgeClass}`}><i class=${`ti ${category.icon}`}></i></span>
                        <div class="min-w-0">
                            <div class="d-flex flex-wrap align-items-center gap-1 mb-1">
                                <span class=${`badge ${category.badgeClass}`}>${category.label}</span>
                                <span class=${`badge ${statusMeta.badgeClass}`}>${statusMeta.label}</span>
                            </div>
                            <div class="fw-semibold text-truncate cron-event-title" title=${title}>${title}</div>
                        </div>
                    </div>
                </td>
                <td>
                    <div class="d-flex flex-column gap-1 align-items-start">
                        <span class="badge bg-secondary-lt text-secondary" title=${scopeLabel}>${truncateMiddle(scopeLabel, 30)}</span>
                        ${laneId && html`<span class="badge bg-secondary-lt text-secondary" title=${`Lane: ${formatLaneLabel(laneId)}`}>${formatLaneLabel(laneId)}</span>`}
                        ${targetLabel && !targetDuplicatesLane && html`<span class="text-muted small text-truncate cron-event-scope" title=${targetLabel}>${truncateMiddle(targetLabel, 34)}</span>`}
                    </div>
                </td>
                <td class="text-muted small" title=${ts ? ts.toLocaleString() : '-'}>
                    <div class="fw-semibold text-body">${formatRelativeTime(ts)}</div>
                    <div>${ts ? ts.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '-'}</div>
                </td>
                <td title=${metricsTooltip || 'No runtime, row, or delivery counters on this event.'}>
                    <div class="cron-activity-signal-pills">
                        ${signalPills.length > 0
                            ? signalPills.slice(0, 5).map((pill) => html`<span class=${`badge ${pill.badgeClass}`}>${pill.label}</span>`)
                            : html`<span class="text-muted small">-</span>`}
                    </div>
                </td>
                <td class="cron-event-context" title=${description}>
                    <span>${truncateEnd(description, 92)}</span>
                </td>
                <td class="text-end">
                    <i class=${`ti ti-chevron-${isExpanded ? 'up' : 'down'} text-muted`}></i>
                </td>
            </tr>
            ${isExpanded && html`
                <tr class="activity-details-row">
                    <td colspan="6">
                        <div class="p-3">
                            <div class="cron-activity-detail-grid mb-3">
                                <div>
                                    <div class="text-muted small">Event ID</div>
                                    <div class="fw-semibold font-monospace text-break">${e.eventId}</div>
                                </div>
                                <div>
                                    <div class="text-muted small">Performed By</div>
                                    <div class="fw-semibold">${e.performedBy || 'system'}</div>
                                </div>
                                <div>
                                    <div class="text-muted small">Type</div>
                                    <div class="fw-semibold">${e.eventType || '-'}${e.subType ? ` / ${e.subType}` : ''}</div>
                                </div>
                                <div>
                                    <div class="text-muted small">Target</div>
                                    <div class="fw-semibold text-break">${e.targetId || e.targetType || '-'}</div>
                                </div>
                            </div>

                            <div class="d-flex flex-wrap gap-2 mb-3">
                                ${duration && html`<span class="badge bg-primary-lt text-primary">duration ${duration}</span>`}
                                ${rowOps > 0 && html`<span class="badge bg-warning-lt text-warning">${formatCompactNumber(rowsRead)} read · ${formatCompactNumber(rowsWritten)} write · ${formatCompactNumber(rowsDeleted)} delete</span>`}
                                ${itemsProcessed > 0 && html`<span class="badge bg-success-lt text-success">${formatCompactNumber(itemsProcessed)} work items</span>`}
                                ${successful > 0 && html`<span class="badge bg-success-lt text-success">${formatCompactNumber(successful)} successful</span>`}
                                ${failed > 0 && html`<span class="badge bg-danger-lt text-danger">${formatCompactNumber(failed)} failed</span>`}
                                ${meta.maxRetries && html`<span class="badge bg-info-lt text-info">retry ${meta.attempt || 1}/${meta.maxRetries}</span>`}
                            </div>

                            ${meta.error && html`
                                <div class="alert alert-danger mb-3">
                                    <strong>Error:</strong> ${meta.error}
                                </div>
                            `}

                            ${diagnosticsEntries.length > 0 && html`
                                <div class="cron-diagnostic-grid mb-3">
                                    ${diagnosticsEntries.slice(0, 8).map(([key, value]) => {
                                        const formattedValue = formatDiagnosticValue(value);
                                        return html`
                                            <div class="cron-diagnostic-item" title=${`${key}: ${formattedValue}`}>
                                                <div class="small text-muted text-truncate">${formatDiagnosticLabel(key)}</div>
                                                <div class="fw-semibold text-truncate">${formattedValue}</div>
                                            </div>
                                        `;
                                    })}
                                </div>
                            `}

                            <div class="d-flex flex-wrap gap-2 align-items-center">
                                ${requestId && html`
                                    <button class="btn btn-sm btn-outline-primary" onClick=${(ev) => {
                                        ev.stopPropagation();
                                        const eventDate = e.timestamp ? new Date(e.timestamp) : new Date();
                                        const pk = eventDate.getFullYear().toString()
                                            + String(eventDate.getMonth() + 1).padStart(2, '0')
                                            + String(eventDate.getDate()).padStart(2, '0');
                                        openTraceModal(pk, requestId);
                                    }}>
                                        <i class="ti ti-list-search me-1"></i>
                                        Trace
                                    </button>
                                `}
                                ${Object.keys(meta).length > 0 && html`
                                    <details class="cron-raw-metadata">
                                        <summary class="cursor-pointer text-muted small">Raw metadata</summary>
                                        <pre class="activity-details-pre mt-2 mb-0 small p-2 rounded">${JSON.stringify(meta, null, 2)}</pre>
                                    </details>
                                `}
                            </div>
                        </div>
                    </td>
                </tr>
            `}
        `;
    }
    
    // Filter events based on selected criteria
    const filteredEvents = events.filter(e => {
        if (filterJob !== 'all') {
            const jobMatch = 
                (filterJob === 'CronExecution' && e.eventType === 'CRONRUN') ||
                (filterJob === 'ReportSent' && (e.eventType === 'SECURITY_REPORT' && (e.subType === 'SecurityReportEmailSent' || e.subType === 'SecurityReportDispatchComplete' || e.subType === 'SecurityReportSent' || e.subType === 'SENT'))) ||
                (filterJob === 'ReportFailed' && (e.eventType === 'SECURITY_REPORT' && (e.subType === 'SecurityReportFailed' || e.subType === 'FAILED'))) ||
                (filterJob === 'BatchComplete' && (e.eventType === 'SECURITY_REPORT' && (e.subType === 'SecurityReportBatchComplete' || e.subType === 'BATCH')));
            if (!jobMatch) return false;
        }
        if (filterStatus !== 'all') {
            const statusMatch = (() => {
                const status = getCronEventStatus(e);
                if (filterStatus === 'success') {
                    if (e.eventType === 'CRONRUN') {
                        return !status || status === 'completed' || status === 'success';
                    }
                    if (e.eventType === 'SECURITY_REPORT') {
                        return ((e.subType || '').toLowerCase().includes('failed')) === false;
                    }
                    return false;
                }
                if (filterStatus === 'failed') {
                    if (e.eventType === 'CRONRUN') {
                        return ['failed', 'exception', 'rejected', 'partialfailure', 'cancelled', 'canceled', 'timedout'].includes(status);
                    }
                    if (e.eventType === 'SECURITY_REPORT') {
                        return e.subType === 'SecurityReportFailed' || e.subType === 'FAILED';
                    }
                    return false;
                }
                if (filterStatus === 'running') {
                    return e.eventType === 'CRONRUN' && status === 'running';
                }
                if (filterStatus === 'queued') {
                    return e.eventType === 'CRONRUN' && status === 'queued';
                }
                return true;
            })();
            if (!statusMatch) return false;
        }
        if (filterOrg && filterOrg.trim() !== '') {
            if (!e.orgId || !e.orgId.toLowerCase().includes(filterOrg.toLowerCase())) return false;
        }
        return true;
    });

    const dailyTrend = (() => {
        const safeDays = Math.max(1, Number(rangeDays || 7));
        const now = new Date();
        const buckets = new Map();

        for (let i = safeDays - 1; i >= 0; i--) {
            const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
            const key = day.toISOString().slice(0, 10);
            buckets.set(key, {
                key,
                label: day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                success: 0,
                failed: 0,
                manual: 0,
                scheduled: 0
            });
        }

        for (const evt of filteredEvents) {
            if (String(evt?.eventType || '').toUpperCase() !== 'CRONRUN') continue;
            const ts = evt?.timestamp ? new Date(evt.timestamp) : null;
            if (!ts || Number.isNaN(ts.getTime())) continue;

            const key = new Date(Date.UTC(ts.getUTCFullYear(), ts.getUTCMonth(), ts.getUTCDate())).toISOString().slice(0, 10);
            const bucket = buckets.get(key);
            if (!bucket) continue;

            const status = String(evt?.metadata?.status || evt?.metadata?.Status || evt?.status || '').toLowerCase();
            const isSuccess = !status || status === 'completed' || status === 'success';
            if (isSuccess) bucket.success += 1;
            else bucket.failed += 1;

            const isManual = String(evt?.subType || '').toLowerCase().includes('manual');
            if (isManual) bucket.manual += 1;
            else bucket.scheduled += 1;
        }

        const points = Array.from(buckets.values());
        const max = Math.max(1, ...points.map((p) => p.success + p.failed));
        const totals = points.reduce((acc, p) => {
            acc.success += p.success;
            acc.failed += p.failed;
            acc.manual += p.manual;
            acc.scheduled += p.scheduled;
            return acc;
        }, { success: 0, failed: 0, manual: 0, scheduled: 0 });

        return { points, max, totals };
    })();

    const runtimeTrend = (() => {
        const safeDays = Math.max(1, Number(rangeDays || 7));
        const now = new Date();
        const buckets = new Map();

        for (let i = safeDays - 1; i >= 0; i--) {
            const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
            const key = day.toISOString().slice(0, 10);
            buckets.set(key, {
                key,
                label: day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                durationMs: 0,
                runs: 0,
                itemsProcessed: 0,
                rowsRead: 0,
                rowsWritten: 0,
                rowsDeleted: 0
            });
        }

        for (const evt of filteredEvents) {
            if (String(evt?.eventType || '').toUpperCase() !== 'CRONRUN') continue;
            const ts = evt?.timestamp ? new Date(evt.timestamp) : null;
            if (!ts || Number.isNaN(ts.getTime())) continue;

            const key = new Date(Date.UTC(ts.getUTCFullYear(), ts.getUTCMonth(), ts.getUTCDate())).toISOString().slice(0, 10);
            const bucket = buckets.get(key);
            if (!bucket) continue;

            const durationMs = getDurationMsFromEvent(evt);
            const budget = getEventOperationBudget(evt);
            bucket.durationMs += durationMs;
            bucket.runs += durationMs > 0 ? 1 : 0;
            bucket.itemsProcessed += toNumber(evt?.metadata?.itemsProcessed ?? evt?.metadata?.entriesRefreshed);
            bucket.rowsRead += budget.rowsRead;
            bucket.rowsWritten += budget.rowsWritten;
            bucket.rowsDeleted += budget.rowsDeleted;
        }

        const points = Array.from(buckets.values());
        const maxDurationMs = Math.max(1, ...points.map((p) => p.durationMs));
        const maxRows = Math.max(1, ...points.map((p) => p.rowsRead + p.rowsWritten + p.rowsDeleted));
        const totals = points.reduce((acc, p) => {
            acc.durationMs += p.durationMs;
            acc.runs += p.runs;
            acc.itemsProcessed += p.itemsProcessed;
            acc.rowsRead += p.rowsRead;
            acc.rowsWritten += p.rowsWritten;
            acc.rowsDeleted += p.rowsDeleted;
            return acc;
        }, { durationMs: 0, runs: 0, itemsProcessed: 0, rowsRead: 0, rowsWritten: 0, rowsDeleted: 0 });

        return { points, maxDurationMs, maxRows, totals };
    })();

    const hourlyCronChurnTrend = (() => {
        const apiTrend = buildHourlyCronChurnTrendFromApi(cronChurnTrend, auditChurnMetric, chartThemeVersion, cronChurnWindowKey, cronChurnFocusKey);
        if (apiTrend) {
            return apiTrend;
        }

        const focus = getCronChurnFocusOption(cronChurnFocusKey);

        const cronRunEvents = filteredEvents
            .filter((event) => String(event?.eventType || '').toUpperCase() === 'CRONRUN' && getCronVolumeTaskIdFromEvent(event));
        const sourceEvents = cronRunEvents.length > 0
            ? cronRunEvents
            : filteredEvents.filter((event) => getCronVolumeTaskIdFromEvent(event));
        const eventTimes = sourceEvents
            .map((event) => event?.timestamp ? new Date(event.timestamp) : null)
            .filter((date) => date && !Number.isNaN(date.getTime()))
            .sort((a, b) => a - b);

        if (eventTimes.length === 0) {
            return {
                points: [],
                tasks: [],
                maxCrudOps: 1,
                spanLabel: 'No loaded audit rows',
                sourceLabel: `${focus.shortLabel} · CRONRUN audit rows`,
                chartKey: `${auditChurnMetric}|empty|${chartThemeVersion}|${focus.key}`,
                selectedMetric: AUDIT_CHURN_METRICS.find((metric) => metric.key === auditChurnMetric) || AUDIT_CHURN_METRICS[0],
                eventNoun: 'audit event',
                focus,
                totals: { auditEvents: 0, durationMs: 0, regularDurationMs: 0, manualRecoveryDurationMs: 0, eventsProcessed: 0, rowsRead: 0, rowsCreated: 0, rowsUpdated: 0, rowsWritten: 0, rowsDeleted: 0, crudOps: 0, regularCrudOps: 0, manualRecoveryCrudOps: 0 }
            };
        }

        const hourMs = 60 * 60 * 1000;
        const selectedWindow = getCronChurnWindowOption(cronChurnWindowKey);
        const firstLoadedHour = floorToUtcHour(eventTimes[0]);
        const lastLoadedHour = floorToUtcHour(eventTimes[eventTimes.length - 1]);
        const cutoffHour = getCronChurnWindowCutoff(selectedWindow, lastLoadedHour) || firstLoadedHour;
        const startHour = new Date(Math.max(firstLoadedHour.getTime(), cutoffHour.getTime()));
        const buckets = new Map();

        for (let hour = new Date(startHour), index = 0; hour <= lastLoadedHour; hour = new Date(hour.getTime() + hourMs), index++) {
            const key = hour.toISOString();
            buckets.set(key, {
                key,
                hour: new Date(hour),
                label: formatHourLabel(hour),
                tickLabel: formatHourTickLabel(hour, index),
                auditEvents: 0,
                durationMs: 0,
                regularDurationMs: 0,
                manualRecoveryDurationMs: 0,
                eventsProcessed: 0,
                rowsRead: 0,
                rowsCreated: 0,
                rowsUpdated: 0,
                rowsWritten: 0,
                rowsDeleted: 0,
                crudOps: 0,
                regularCrudOps: 0,
                manualRecoveryCrudOps: 0,
                byTask: new Map()
            });
        }

        for (const event of sourceEvents) {
            const timestamp = event?.timestamp ? new Date(event.timestamp) : null;
            if (!timestamp || Number.isNaN(timestamp.getTime())) continue;
            const hour = floorToUtcHour(timestamp);
            if (hour < startHour || hour > lastLoadedHour) continue;

            const bucket = buckets.get(hour.toISOString());
            if (!bucket) continue;

            const taskId = getCronVolumeTaskIdFromEvent(event);
            if (!taskId) continue;
            const volume = getEventVolumeMetrics(event);
            const eventsProcessed = volume.eventsProcessed || volume.rowsProcessed;
            const crudOps = volume.rowsRead + volume.rowsWritten + volume.rowsDeleted;
            const laneId = String(event?.metadata?.laneId || event?.metadata?.LaneId || '');
            const triggerSource = String(event?.metadata?.triggerSource || event?.metadata?.TriggerSource || event?.metadata?.requestedBy || event?.metadata?.RequestedBy || '');
            const durationMs = getDurationMsFromEvent(event);
            const split = getCronCostSplit({ taskId, laneId, triggerSource, crudOps, durationMs });
            bucket.auditEvents += 1;
            bucket.durationMs += durationMs;
            bucket.eventsProcessed += eventsProcessed;
            bucket.rowsRead += volume.rowsRead;
            bucket.rowsCreated += volume.rowsCreated;
            bucket.rowsUpdated += volume.rowsUpdated;
            bucket.rowsWritten += volume.rowsWritten;
            bucket.rowsDeleted += volume.rowsDeleted;
            bucket.crudOps += crudOps;
            bucket.regularCrudOps += split.regularCrudOps;
            bucket.manualRecoveryCrudOps += split.manualRecoveryCrudOps;
            bucket.regularDurationMs += split.regularDurationMs;
            bucket.manualRecoveryDurationMs += split.manualRecoveryDurationMs;

            const taskKey = String(taskId);
            const taskPoint = bucket.byTask.get(taskKey) || {
                taskKey,
                taskId: taskKey,
                laneId,
                executionScope: 'global',
                triggerSource,
                label: formatCronTaskLabel(taskKey),
                auditEvents: 0,
                durationMs: 0,
                regularDurationMs: 0,
                manualRecoveryDurationMs: 0,
                eventsProcessed: 0,
                rowsRead: 0,
                rowsCreated: 0,
                rowsUpdated: 0,
                rowsWritten: 0,
                rowsDeleted: 0,
                crudOps: 0,
                regularCrudOps: 0,
                manualRecoveryCrudOps: 0
            };
            taskPoint.auditEvents += 1;
            taskPoint.durationMs += durationMs;
            taskPoint.regularDurationMs += split.regularDurationMs;
            taskPoint.manualRecoveryDurationMs += split.manualRecoveryDurationMs;
            taskPoint.eventsProcessed += eventsProcessed;
            taskPoint.rowsRead += volume.rowsRead;
            taskPoint.rowsCreated += volume.rowsCreated;
            taskPoint.rowsUpdated += volume.rowsUpdated;
            taskPoint.rowsWritten += volume.rowsWritten;
            taskPoint.rowsDeleted += volume.rowsDeleted;
            taskPoint.crudOps += crudOps;
            taskPoint.regularCrudOps += split.regularCrudOps;
            taskPoint.manualRecoveryCrudOps += split.manualRecoveryCrudOps;
            bucket.byTask.set(taskKey, taskPoint);
        }

        const { points } = applyCronChurnFocusToPoints(Array.from(buckets.values()), cronChurnFocusKey);
        const tasks = buildCronChurnTaskSeries(points);
        const totals = points.reduce((acc, point) => {
            acc.auditEvents += point.auditEvents;
            acc.durationMs += point.durationMs;
            acc.regularDurationMs += point.regularDurationMs;
            acc.manualRecoveryDurationMs += point.manualRecoveryDurationMs;
            acc.eventsProcessed += point.eventsProcessed;
            acc.rowsRead += point.rowsRead;
            acc.rowsCreated += point.rowsCreated;
            acc.rowsUpdated += point.rowsUpdated;
            acc.rowsWritten += point.rowsWritten;
            acc.rowsDeleted += point.rowsDeleted;
            acc.crudOps += point.crudOps;
            acc.regularCrudOps += point.regularCrudOps;
            acc.manualRecoveryCrudOps += point.manualRecoveryCrudOps;
            return acc;
        }, { auditEvents: 0, durationMs: 0, regularDurationMs: 0, manualRecoveryDurationMs: 0, eventsProcessed: 0, rowsRead: 0, rowsCreated: 0, rowsUpdated: 0, rowsWritten: 0, rowsDeleted: 0, crudOps: 0, regularCrudOps: 0, manualRecoveryCrudOps: 0 });
        const maxCrudOps = Math.max(1, ...tasks.map((task) => task.crudOps));
        const spanLabel = points.length === 1
            ? points[0].label
            : `${points[0].label} - ${points[points.length - 1].label}`;
        const selectedMetric = AUDIT_CHURN_METRICS.find((metric) => metric.key === auditChurnMetric) || AUDIT_CHURN_METRICS[0];
        const sourceLabel = `${focus.shortLabel} · ${formatCronChurnWindowLabel(selectedWindow)} · ${cronRunEvents.length > 0 ? 'CRONRUN audit rows' : 'direct volume audit rows'}`;
        const chartKey = JSON.stringify({
            windowKey: selectedWindow.key,
            focusKey: focus.key,
            metric: selectedMetric.key,
            theme: chartThemeVersion,
            labels: points.map((point) => point.key),
            tasks: tasks.map((task) => ({
                taskId: task.taskKey || task.taskId,
                data: task.points.map((point) => getMetricValueFromPoint(point, selectedMetric.key, DEFAULT_CRON_COST_MODEL))
            }))
        });

        return { points, tasks, maxCrudOps, spanLabel, sourceLabel, selectedMetric, chartKey, totals, eventNoun: 'audit event', focus, costModel: DEFAULT_CRON_COST_MODEL };
    })();

    const cronChurnCostModel = hourlyCronChurnTrend?.costModel || DEFAULT_CRON_COST_MODEL;
    const cronChurnTotalCostParts = splitCronCost(hourlyCronChurnTrend?.totals || {}, cronChurnCostModel);

    useEffect(() => {
        if (auditChurnChartRef.current) {
            try {
                auditChurnChartRef.current.destroy();
            } catch (error) {
                logger.warn('[Cron Activity] Failed to destroy previous audit churn chart', error);
            }
            auditChurnChartRef.current = null;
        }

        const canvas = auditChurnCanvasRef.current;
        if (!canvas || !window.Chart || hourlyCronChurnTrend.tasks.length === 0) return undefined;

        const existing = window.Chart.getChart(canvas);
        if (existing) existing.destroy();

        const theme = document.documentElement.getAttribute('data-bs-theme') || 'light';
        const isDark = theme === 'dark';
        const gridColor = isDark ? 'rgba(148, 163, 184, 0.20)' : 'rgba(148, 163, 184, 0.26)';
        const tickColor = isDark ? '#cbd5e1' : '#475569';
        const selectedMetricKey = hourlyCronChurnTrend.selectedMetric.key;
        const selectedCostMode = getCronChurnCostModeOption(cronChurnCostModeKey);
        const costModel = hourlyCronChurnTrend.costModel || DEFAULT_CRON_COST_MODEL;
        const accumulatedCostSeries = buildAccumulatedCostSeries(hourlyCronChurnTrend.points, costModel);
        const taskDatasets = hourlyCronChurnTrend.tasks.map((task) => ({
            label: task.label,
            data: task.points.map((point) => getMetricValueFromPoint(point, selectedMetricKey, costModel)),
            borderColor: task.color,
            backgroundColor: `${task.color}22`,
            pointBackgroundColor: task.color,
            pointBorderColor: task.color,
            borderWidth: 2,
            pointRadius: 2.5,
            pointHoverRadius: 5,
            tension: 0.28,
            fill: false,
            yAxisID: 'y'
        }));
        const costDatasetOptions = {
            regular: {
                label: 'Regular total accumulated cost',
                accumulatedKey: 'regularAccumulatedCost',
                hourKey: 'regularHourCost',
                storageKey: 'regularHourStorageCost',
                computeKey: 'regularHourComputeCost',
                color: '#16a34a',
                background: isDark ? 'rgba(22, 163, 74, 0.12)' : 'rgba(22, 163, 74, 0.09)'
            },
            manualRecovery: {
                label: 'Manual/recovery total accumulated cost',
                accumulatedKey: 'manualRecoveryAccumulatedCost',
                hourKey: 'manualRecoveryHourCost',
                storageKey: 'manualRecoveryHourStorageCost',
                computeKey: 'manualRecoveryHourComputeCost',
                color: '#f97316',
                background: isDark ? 'rgba(249, 115, 22, 0.13)' : 'rgba(249, 115, 22, 0.09)'
            },
            total: {
                label: 'Total accumulated cost',
                accumulatedKey: 'accumulatedCost',
                hourKey: 'hourCost',
                storageKey: 'hourStorageCost',
                computeKey: 'hourComputeCost',
                color: '#0ea5e9',
                background: isDark ? 'rgba(14, 165, 233, 0.13)' : 'rgba(14, 165, 233, 0.10)'
            }
        };
        const selectedCostKinds = selectedCostMode.key === 'both'
            ? ['regular', 'manualRecovery']
            : [selectedCostMode.key];
        const costOverlayDataset = showCronChurnCost ? selectedCostKinds
            .map((kind) => costDatasetOptions[kind])
            .filter(Boolean)
            .map((config) => ({
                label: config.label,
                data: accumulatedCostSeries.map((point) => point[config.accumulatedKey]),
                borderColor: config.color,
                backgroundColor: config.background,
                pointBackgroundColor: config.color,
                pointBorderColor: config.color,
                borderWidth: 2,
                pointRadius: 0,
                pointHoverRadius: 4,
                tension: 0.24,
                fill: selectedCostKinds.length === 1,
                yAxisID: 'yCost',
                cronChurnCostOverlay: true,
                cronChurnCostAccumulatedKey: config.accumulatedKey,
                cronChurnCostHourKey: config.hourKey,
                cronChurnCostStorageKey: config.storageKey,
                cronChurnCostComputeKey: config.computeKey
            })) : [];

        auditChurnChartRef.current = new window.Chart(canvas, {
            type: 'line',
            data: {
                labels: hourlyCronChurnTrend.points.map((point) => point.hour),
                datasets: [...taskDatasets, ...costOverlayDataset]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'nearest', intersect: false },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: tickColor,
                            boxWidth: 10,
                            boxHeight: 10,
                            usePointStyle: true
                        }
                    },
                    tooltip: {
                        callbacks: {
                            title: (items) => {
                                const raw = items?.[0]?.label;
                                const date = raw ? new Date(raw) : null;
                                return date && !Number.isNaN(date.getTime())
                                    ? date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric' })
                                    : raw;
                            },
                            label: (context) => {
                                if (context.dataset?.cronChurnCostOverlay) {
                                    const costPoint = accumulatedCostSeries[context.dataIndex] || {};
                                    const accumulatedKey = context.dataset.cronChurnCostAccumulatedKey || 'accumulatedCost';
                                    const hourKey = context.dataset.cronChurnCostHourKey || 'hourCost';
                                    const storageKey = context.dataset.cronChurnCostStorageKey || 'hourStorageCost';
                                    const computeKey = context.dataset.cronChurnCostComputeKey || 'hourComputeCost';
                                    return `${context.dataset.label}: ${formatUsd(costPoint[accumulatedKey])} | hour ${formatUsd(costPoint[hourKey])} (storage ${formatUsd(costPoint[storageKey])}, compute ${formatUsd(costPoint[computeKey])})`;
                                }

                                const task = hourlyCronChurnTrend.tasks[context.datasetIndex];
                                const point = task?.points?.[context.dataIndex];
                                const formattedValue = formatAuditChurnMetricValue(context.parsed.y, selectedMetricKey);
                                if (!task || !point) return `${context.dataset.label}: ${formattedValue}`;
                                return `${task.label}: ${formattedValue} ${hourlyCronChurnTrend.selectedMetric.label.toLowerCase()} | processed ${formatCompactNumber(point.eventsProcessed)}, read ${formatCompactNumber(point.rowsRead)}, write ${formatCompactNumber(point.rowsWritten)}, cost ${formatUsd(estimateCronRunCostUsd(point, costModel))}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        type: 'time',
                        time: { unit: 'hour', tooltipFormat: 'MMM d, h a' },
                        grid: { color: gridColor },
                        ticks: {
                            color: tickColor,
                            maxRotation: 0,
                            autoSkip: true,
                            maxTicksLimit: 8,
                            callback: (value) => formatAxisDateTimeLabel(value)
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: gridColor },
                        ticks: {
                            color: tickColor,
                            callback: (value) => formatAuditChurnMetricValue(value, selectedMetricKey)
                        },
                        title: {
                            display: true,
                            text: hourlyCronChurnTrend.selectedMetric.axisLabel,
                            color: tickColor
                        }
                    },
                    yCost: {
                        display: showCronChurnCost,
                        beginAtZero: true,
                        position: 'right',
                        grid: { drawOnChartArea: false, color: gridColor },
                        ticks: {
                            color: tickColor,
                            callback: (value) => formatUsd(value)
                        },
                        title: {
                            display: showCronChurnCost,
                            text: 'Accumulated est. total cost',
                            color: tickColor
                        }
                    }
                }
            }
        });

        return () => {
            if (auditChurnChartRef.current) {
                auditChurnChartRef.current.destroy();
                auditChurnChartRef.current = null;
            }
        };
    }, [hourlyCronChurnTrend.chartKey, showCronChurnCost, cronChurnCostModeKey]);

    const efficiencyTrend = (() => {
        const points = runtimeTrend.points.map((point) => {
            const minutes = point.durationMs > 0 ? point.durationMs / 60000 : 0;
            const rowOps = point.rowsRead + point.rowsWritten + point.rowsDeleted;
            return {
                ...point,
                rowOps,
                workPerMinute: minutes > 0 ? point.itemsProcessed / minutes : 0,
                opsPerMinute: minutes > 0 ? rowOps / minutes : 0
            };
        });

        const maxWorkPerMinute = Math.max(1, ...points.map((point) => point.workPerMinute));
        const maxOpsPerMinute = Math.max(1, ...points.map((point) => point.opsPerMinute));
        const peakRuntimeDay = [...points].sort((a, b) => b.durationMs - a.durationMs)[0] || null;
        const peakOpsDay = [...points].sort((a, b) => b.rowOps - a.rowOps)[0] || null;
        const peakEfficiencyDay = [...points].sort((a, b) => b.workPerMinute - a.workPerMinute)[0] || null;

        return { points, maxWorkPerMinute, maxOpsPerMinute, peakRuntimeDay, peakOpsDay, peakEfficiencyDay };
    })();

    const cronTasks = Array.isArray(cronStatus?.tasks) ? cronStatus.tasks : [];
    const currentCronStatus = cronStatus?.currentStatus || {};
    const scalePressure = cronStatus?.scalePressure || cronStatus?.ScalePressure || null;
    const scaleSignals = Array.isArray(scalePressure?.signals) ? scalePressure.signals : [];
    const scaleHotTasks = Array.isArray(scalePressure?.hotTasks) ? scalePressure.hotTasks : [];
    const scaleLanePressure = Array.isArray(scalePressure?.lanePressure) ? scalePressure.lanePressure : [];
    const scaleTopSignal = scaleSignals[0] || null;
    const scaleTopTask = scaleHotTasks[0] || null;
    const scaleTopLane = scaleLanePressure[0] || null;
    const scaleSignalTooltip = scaleSignals.length > 0
        ? scaleSignals.slice(0, 5).map((signal) => {
            const metric = signal.metricValue ? ` (${signal.metricLabel || 'metric'}: ${signal.metricValue})` : '';
            const action = signal.recommendation ? ` Action: ${signal.recommendation}` : '';
            return `${signal.title || signal.code}${metric}. ${signal.message || ''}${action}`;
        }).join('\n')
        : 'No warning or critical cron scale-pressure signals crossed threshold in this sample window.';
    const scaleIndexTooltip = 'No native Azure Table index is being proposed. Detection reuses the existing per-org Current AppProduct projection for MODR observed-resolution fan-out, alongside InventoryActive and AppVersionIntel MOD/MODR.';
    const activeLaneId = currentCronStatus.lockedLaneId || null;
    const activeExecutionScope = currentCronStatus.lockedScope || 'global';
    const taskLaneLookup = (() => {
        const lookup = new Map();
        for (const task of cronTasks) {
            if (task.taskId && task.laneId) lookup.set(String(task.taskId), task.laneId);
            if (task.displayName && task.laneId) lookup.set(String(task.displayName), task.laneId);
        }
        return lookup;
    })();

    const getLaneIdForEvent = (event, taskId) => {
        const meta = event?.metadata || {};
        const explicitLane = meta.laneId || meta.LaneId || meta.lane || meta.Lane;
        if (explicitLane) return normalizeLaneId(explicitLane);

        const targetLane = normalizeLaneId(event?.targetId || meta.scopeKey || meta.ScopeKey);
        if (LANE_ORDER.includes(targetLane)) return targetLane;

        const mappedLane = taskId ? taskLaneLookup.get(String(taskId)) : null;
        if (mappedLane) return normalizeLaneId(mappedLane);

        return 'unassigned';
    };

    const taskRuntimeLeaders = (() => {
        const byTask = new Map();
        for (const evt of filteredEvents) {
            if (String(evt?.eventType || '').toUpperCase() !== 'CRONRUN') continue;
            const meta = evt?.metadata || {};
            const taskId = getTaskIdFromEvent(evt);
            if (!taskId) continue;

            const durationMs = getDurationMsFromEvent(evt);
            const budget = getEventOperationBudget(evt);
            const key = String(taskId);
            const existing = byTask.get(key) || {
                taskId: key,
                runs: 0,
                totalDurationMs: 0,
                maxDurationMs: 0,
                itemsProcessed: 0,
                rowsRead: 0,
                rowsWritten: 0,
                rowsDeleted: 0
            };
            existing.runs += 1;
            existing.totalDurationMs += durationMs;
            existing.maxDurationMs = Math.max(existing.maxDurationMs, durationMs);
            existing.itemsProcessed += toNumber(meta.itemsProcessed ?? meta.entriesRefreshed);
            existing.rowsRead += budget.rowsRead;
            existing.rowsWritten += budget.rowsWritten;
            existing.rowsDeleted += budget.rowsDeleted;
            byTask.set(key, existing);
        }

        return Array.from(byTask.values())
            .map((item) => ({
                ...item,
                averageDurationMs: item.runs > 0 ? item.totalDurationMs / item.runs : 0,
                totalRows: item.rowsRead + item.rowsWritten + item.rowsDeleted
            }))
            .sort((a, b) => b.totalDurationMs - a.totalDurationMs)
            .slice(0, 6);
    })();

    const maxTaskDurationMs = Math.max(1, ...taskRuntimeLeaders.map((item) => item.totalDurationMs));
    const totalTaskDurationMs = taskRuntimeLeaders.reduce((sum, item) => sum + item.totalDurationMs, 0);

    const taskEfficiencyLeaders = taskRuntimeLeaders
        .map((item) => {
            const minutes = item.totalDurationMs > 0 ? item.totalDurationMs / 60000 : 0;
            return {
                ...item,
                workPerMinute: minutes > 0 ? item.itemsProcessed / minutes : 0,
                opsPerMinute: minutes > 0 ? item.totalRows / minutes : 0
            };
        })
        .filter((item) => item.workPerMinute > 0 || item.opsPerMinute > 0)
        .sort((a, b) => (b.workPerMinute + (b.opsPerMinute / 1000)) - (a.workPerMinute + (a.opsPerMinute / 1000)))
        .slice(0, 4);

    const laneLoadMix = (() => {
        const byLane = new Map();
        for (const evt of filteredEvents) {
            if (String(evt?.eventType || '').toUpperCase() !== 'CRONRUN') continue;

            const taskId = getTaskIdFromEvent(evt);
            const laneId = getLaneIdForEvent(evt, taskId);
            const durationMs = getDurationMsFromEvent(evt);
            const budget = getEventOperationBudget(evt);
            const totalRows = budget.rowsRead + budget.rowsWritten + budget.rowsDeleted;
            const status = getCronEventStatus(evt);
            const existing = byLane.get(laneId) || {
                laneId,
                runs: 0,
                failed: 0,
                durationMs: 0,
                itemsProcessed: 0,
                totalRows: 0
            };

            existing.runs += durationMs > 0 ? 1 : 0;
            existing.failed += ['failed', 'exception', 'rejected', 'partialfailure', 'cancelled', 'canceled', 'timedout'].includes(status) ? 1 : 0;
            existing.durationMs += durationMs;
            existing.itemsProcessed += toNumber(evt?.metadata?.itemsProcessed ?? evt?.metadata?.entriesRefreshed);
            existing.totalRows += totalRows;
            byLane.set(laneId, existing);
        }

        return Array.from(byLane.values())
            .filter((item) => item.durationMs > 0 || item.totalRows > 0 || item.itemsProcessed > 0)
            .sort((a, b) => {
                const aOrder = LANE_ORDER.includes(a.laneId) ? LANE_ORDER.indexOf(a.laneId) : 99;
                const bOrder = LANE_ORDER.includes(b.laneId) ? LANE_ORDER.indexOf(b.laneId) : 99;
                return aOrder === bOrder ? b.durationMs - a.durationMs : aOrder - bOrder;
            });
    })();

    const maxLaneDurationMs = Math.max(1, ...laneLoadMix.map((item) => item.durationMs));
    const maxLaneRows = Math.max(1, ...laneLoadMix.map((item) => item.totalRows));
    const totalLaneDurationMs = laneLoadMix.reduce((sum, item) => sum + item.durationMs, 0);
    const totalLaneRows = laneLoadMix.reduce((sum, item) => sum + item.totalRows, 0);
    const topLaneByRuntime = [...laneLoadMix].sort((a, b) => b.durationMs - a.durationMs)[0] || null;

    const laneIds = Array.from(new Set([
        ...LANE_ORDER,
        ...cronTasks.map((task) => task.laneId).filter(Boolean)
    ])).filter((laneId) => cronTasks.some((task) => task.laneId === laneId) || laneId === activeLaneId);
    const laneSummaries = laneIds.map((laneId) => {
        const laneTasks = cronTasks.filter((task) => task.laneId === laneId);
        return {
            laneId,
            label: formatLaneLabel(laneId),
            total: laneTasks.length,
            overdue: laneTasks.filter((task) => task.isOverdue).length,
            active: activeLaneId === laneId
        };
    });
    const laneStatusSummary = {
        healthy: laneSummaries.filter((lane) => lane.overdue === 0).length,
        overdueTasks: laneSummaries.reduce((sum, lane) => sum + lane.overdue, 0),
        runningLane: laneSummaries.find((lane) => lane.active) || null
    };
    const lockExpiresAt = currentCronStatus.lockExpires ? new Date(currentCronStatus.lockExpires) : null;
    const activeLockExpired = lockExpiresAt && lockExpiresAt < new Date();

    function getTaskLiveState(task) {
        const taskRuns = events
            .filter(e => e.eventType === 'CRONRUN' && (e.metadata?.taskId || e.metadata?.TaskId) === task.taskId)
            .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));

        const latestRun = taskRuns[0] || null;
        const runStatus = latestRun?.metadata?.status || latestRun?.metadata?.Status || latestRun?.status || null;

        if (!latestRun) {
            return {
                key: task.isOverdue ? 'overdue' : 'scheduled',
                label: task.isOverdue ? 'Overdue' : 'On Schedule',
                badgeClass: task.isOverdue ? 'bg-danger text-white' : 'bg-success text-white',
                icon: task.isOverdue ? 'ti-alert-circle' : 'ti-check',
                progressPercent: null,
                ageMinutes: null
            };
        }

        if (runStatus === 'Queued') {
            return {
                key: 'queued',
                label: 'Queued',
                badgeClass: 'bg-info text-white',
                icon: 'ti-clock-hour-4',
                progressPercent: null,
                ageMinutes: null
            };
        }

        if (runStatus !== 'Running') {
            return {
                key: task.isOverdue ? 'overdue' : 'scheduled',
                label: task.isOverdue ? 'Overdue' : 'On Schedule',
                badgeClass: task.isOverdue ? 'bg-danger text-white' : 'bg-success text-white',
                icon: task.isOverdue ? 'ti-alert-circle' : 'ti-check',
                progressPercent: null,
                ageMinutes: null
            };
        }

        const progressAtRaw =
            latestRun.metadata?.progressAt ||
            latestRun.metadata?.lastProgressAt ||
            latestRun.metadata?.progress?.at ||
            latestRun.timestamp;
        const progressAt = progressAtRaw ? new Date(progressAtRaw) : null;
        const ageMinutes = progressAt ? (Date.now() - progressAt.getTime()) / 60000 : null;
        const progressPercent = latestRun.metadata?.progressPercent ?? latestRun.metadata?.progress?.percent ?? null;
        // Heartbeat ticks (CronCoordinator emits every 30s when the task itself is quiet)
        // carry isHeartbeat=true and a stage prefix of "Heartbeat (...)". Treat them as
        // proof-of-life but keep the display tied to the last *real* stage so users can
        // tell genuine multi-stage progress apart from "still running, no new milestone."
        const isHeartbeat = !!(latestRun.metadata?.progress?.isHeartbeat);
        const quietSeconds = latestRun.metadata?.progress?.quietSeconds ?? null;

        const lockExpiresRaw = cronStatus?.currentStatus?.lockExpires;
        const lockExpired = lockExpiresRaw ? new Date(lockExpiresRaw) < new Date() : false;

        if (ageMinutes != null && ageMinutes > 10 && lockExpired) {
            return {
                key: 'killed',
                label: 'Possibly Killed',
                badgeClass: 'bg-dark text-white',
                icon: 'ti-plug-x',
                progressPercent,
                ageMinutes,
                isHeartbeat,
                quietSeconds
            };
        }

        if (ageMinutes != null && ageMinutes > 10) {
            return {
                key: 'stuck',
                label: 'Stuck',
                badgeClass: 'bg-warning text-white',
                icon: 'ti-alert-triangle',
                progressPercent,
                ageMinutes,
                isHeartbeat,
                quietSeconds
            };
        }

        return {
            key: 'running',
            label: isHeartbeat ? 'Running (heartbeat)' : 'Running',
            badgeClass: 'bg-primary text-white',
            icon: 'ti-player-play',
            progressPercent,
            ageMinutes,
            isHeartbeat,
            quietSeconds
        };
    }

    // --- Trace Viewer helpers ---

    function openTraceModal(pk, tid) {
        setTracePartitionKey(pk || '');
        setTraceTracingId(tid || '');
        setTraceLogs([]);
        setTraceError('');
        setTraceExpandedRows(new Set());
        setTraceExpandedField(null);
        setTraceSortCol('rowKey');
        setTraceSortDir('asc');
        setTraceModalOpen(true);
        if (pk && tid) fetchTraceLogs(pk, tid);
    }

    async function fetchTraceLogs(pk, tid) {
        setTraceLoading(true);
        setTraceError('');
        setTraceLogs([]);
        try {
            const res = await api.adminGetTraceLogs(pk, tid);
            const data = res?.data || res;
            if (data?.success === false) {
                setTraceError(data.message || data.error || 'Query failed');
            } else {
                const rows = data?.data?.logs || data?.logs || [];
                setTraceLogs(rows);
                if (rows.length === 0) setTraceError('No log entries found for this trace.');
            }
        } catch (err) {
            setTraceError(err.message || 'Failed to fetch trace logs');
        } finally {
            setTraceLoading(false);
        }
    }

    function toggleTraceSort(col) {
        if (traceSortCol === col) {
            setTraceSortDir(traceSortDir === 'asc' ? 'desc' : 'asc');
        } else {
            setTraceSortCol(col);
            setTraceSortDir('asc');
        }
    }

    function getSortedTraceLogs() {
        if (!traceLogs.length) return [];
        const sorted = [...traceLogs].sort((a, b) => {
            let va = a[traceSortCol], vb = b[traceSortCol];
            if (va == null) va = '';
            if (vb == null) vb = '';
            if (typeof va === 'number' && typeof vb === 'number') return traceSortDir === 'asc' ? va - vb : vb - va;
            return traceSortDir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
        });
        return sorted;
    }

    function tryParseJson(str) {
        if (!str || typeof str !== 'string') return null;
        const trimmed = str.trim();
        if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
            try { return JSON.parse(trimmed); } catch { return null; }
        }
        return null;
    }

    function renderJsonCell(value, rowKey, fieldName) {
        if (!value) return html`<span class="text-muted">-</span>`;
        const parsed = tryParseJson(value);
        const isExpanded = traceExpandedField?.rowKey === rowKey && traceExpandedField?.field === fieldName;

        if (parsed) {
            return html`
                <div>
                    <button class="btn btn-sm btn-ghost-secondary py-0 px-1" onClick=${(ev) => {
                        ev.stopPropagation();
                        setTraceExpandedField(isExpanded ? null : { rowKey, field: fieldName });
                    }}>
                        <i class="ti ti-${isExpanded ? 'chevron-up' : 'code'}"></i>
                        <span class="ms-1 small">${isExpanded ? 'Collapse' : 'Expand'} JSON</span>
                    </button>
                    ${isExpanded && html`
                        <pre class="mt-1 mb-0 p-2 rounded small" style="max-height:400px;overflow:auto;background:var(--tblr-bg-surface-secondary,#f8f9fa);white-space:pre-wrap;word-break:break-word;">${JSON.stringify(parsed, null, 2)}</pre>
                    `}
                    ${!isExpanded && html`
                        <div class="text-muted small text-truncate" style="max-width:300px;" title=${value}>${value.slice(0, 80)}${value.length > 80 ? '…' : ''}</div>
                    `}
                </div>
            `;
        }

        // Plain text, possibly long
        if (value.length > 120) {
            return html`
                <div>
                    <span class="small" style="cursor:pointer;word-break:break-word;" onClick=${(ev) => {
                        ev.stopPropagation();
                        setTraceExpandedField(isExpanded ? null : { rowKey, field: fieldName });
                    }}>
                        ${isExpanded ? value : value.slice(0, 120) + '…'}
                    </span>
                </div>
            `;
        }

        return html`<span class="small" style="word-break:break-word;">${value}</span>`;
    }

    function renderTraceModal() {
        if (!traceModalOpen) return null;

        const sortedLogs = getSortedTraceLogs();
        const sortIcon = (col) => traceSortCol === col ? (traceSortDir === 'asc' ? ' ↑' : ' ↓') : '';

        const levelBadge = (level) => {
            const l = (level || '').toUpperCase();
            if (l === 'ERROR') return 'bg-danger text-white';
            if (l === 'WARNING') return 'bg-warning text-white';
            if (l === 'INFORMATION' || l === 'INFO') return 'bg-info-lt text-info';
            if (l === 'DEBUG') return 'bg-secondary-lt text-secondary';
            if (l === 'TRACE') return 'bg-dark-lt text-dark';
            return 'bg-secondary-lt text-secondary';
        };

        const statusBadge = (status) => {
            const s = (status || '').toLowerCase();
            if (s === 'success' || s === 'completed') return 'bg-success-lt text-success';
            if (s === 'failed' || s === 'error') return 'bg-danger-lt text-danger';
            if (s === 'running') return 'bg-primary-lt text-primary';
            return 'bg-secondary-lt text-secondary';
        };

        return html`
            <div class="modal modal-blur show d-block" tabindex="-1" style="background:rgba(0,0,0,.5)" onClick=${(ev) => { if (ev.target === ev.currentTarget) setTraceModalOpen(false); }}>
                <div class="modal-dialog modal-dialog-scrollable" style="max-width:95vw;">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">
                                <i class="ti ti-list-search me-2"></i>
                                Trace Log Viewer
                            </h5>
                            <button class="btn-close" onClick=${() => setTraceModalOpen(false)}></button>
                        </div>
                        <div class="modal-body">
                            <!-- Query Form -->
                            <div class="row g-2 mb-3">
                                <div class="col-md-4">
                                    <label class="form-label">Partition Key (yyyyMMdd)</label>
                                    <input type="text" class="form-control" placeholder="e.g. 20260321"
                                        maxlength="8"
                                        value=${tracePartitionKey}
                                        onInput=${(e) => setTracePartitionKey(e.target.value)} />
                                </div>
                                <div class="col-md-4">
                                    <label class="form-label">Tracing ID</label>
                                    <input type="text" class="form-control" placeholder="e.g. a1b2c3d4"
                                        value=${traceTracingId}
                                        onInput=${(e) => setTraceTracingId(e.target.value)} />
                                </div>
                                <div class="col-md-4 d-flex align-items-end">
                                    <button class="btn btn-primary w-100"
                                        disabled=${traceLoading || !tracePartitionKey || !traceTracingId}
                                        onClick=${() => fetchTraceLogs(tracePartitionKey, traceTracingId)}>
                                        ${traceLoading 
                                            ? html`<span class="spinner-border spinner-border-sm me-2"></span>Querying...`
                                            : html`<i class="ti ti-search me-2"></i>Query Trace`}
                                    </button>
                                </div>
                            </div>

                            ${traceError && html`
                                <div class="alert alert-${traceLogs.length === 0 && !traceLoading ? 'warning' : 'danger'} mb-3">
                                    ${traceError}
                                </div>
                            `}

                            ${sortedLogs.length > 0 && html`
                                <div class="small text-muted mb-2">${sortedLogs.length} log entries • Click column headers to sort</div>
                                <div class="table-responsive" style="max-height:60vh;overflow:auto;">
                                    <table class="table table-sm table-hover table-bordered">
                                        <thead class="sticky-top" style="background:var(--tblr-bg-surface,#fff);z-index:1;">
                                            <tr>
                                                <th class="cursor-pointer" style="min-width:90px;" onClick=${() => toggleTraceSort('rowKey')}>Time${sortIcon('rowKey')}</th>
                                                <th class="cursor-pointer" style="min-width:70px;" onClick=${() => toggleTraceSort('logLevel')}>Level${sortIcon('logLevel')}</th>
                                                <th class="cursor-pointer" style="min-width:60px;" onClick=${() => toggleTraceSort('source')}>Source${sortIcon('source')}</th>
                                                <th class="cursor-pointer" style="min-width:140px;" onClick=${() => toggleTraceSort('called')}>Called${sortIcon('called')}</th>
                                                <th class="cursor-pointer" style="min-width:70px;" onClick=${() => toggleTraceSort('status')}>Status${sortIcon('status')}</th>
                                                <th class="cursor-pointer text-end" style="min-width:60px;" onClick=${() => toggleTraceSort('elapsedMs')}>Ms${sortIcon('elapsedMs')}</th>
                                                <th style="min-width:200px;">Params</th>
                                                <th style="min-width:200px;">Return</th>
                                                <th style="min-width:200px;">Context</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${sortedLogs.map((log) => {
                                                // Parse rowKey to display time: HHmmssfff-seq -> HH:mm:ss.fff
                                                const rk = log.rowKey || '';
                                                const timePart = rk.split('-')[0] || '';
                                                const displayTime = timePart.length >= 9
                                                    ? timePart.slice(0,2) + ':' + timePart.slice(2,4) + ':' + timePart.slice(4,6) + '.' + timePart.slice(6,9)
                                                    : rk;

                                                return html`
                                                    <tr>
                                                        <td class="font-monospace small">${displayTime}</td>
                                                        <td><span class="badge ${levelBadge(log.logLevel)}">${log.logLevel || '-'}</span></td>
                                                        <td class="small">${log.source || '-'}</td>
                                                        <td class="small font-monospace text-truncate" style="max-width:250px;" title=${log.called || ''}>${log.called || '-'}</td>
                                                        <td><span class="badge ${statusBadge(log.status)}">${log.status || '-'}</span></td>
                                                        <td class="text-end font-monospace small">${log.elapsedMs != null ? log.elapsedMs : '-'}</td>
                                                        <td>${renderJsonCell(log.params, log.rowKey, 'params')}</td>
                                                        <td>${renderJsonCell(log.return, log.rowKey, 'return')}</td>
                                                        <td>${renderJsonCell(log.context, log.rowKey, 'context')}</td>
                                                    </tr>
                                                `;
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            `}

                            ${!traceLoading && sortedLogs.length === 0 && !traceError && html`
                                <div class="empty py-4">
                                    <div class="empty-icon"><i class="ti ti-list-search"></i></div>
                                    <p class="empty-title">Enter a partition key and tracing ID to query logs</p>
                                    <p class="empty-subtitle text-muted">Partition key format: yyyyMMdd (e.g. 20260321). Tracing ID is the 8-char hex from cron job metadata.</p>
                                </div>
                            `}
                        </div>
                        <div class="modal-footer">
                            <button class="btn btn-secondary" onClick=${() => setTraceModalOpen(false)}>Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function renderCronChurnHelpModal() {
        if (!cronChurnHelpOpen) return null;

        return html`
            <div class="modal modal-blur show d-block" tabindex="-1" style="background:rgba(0,0,0,.5);z-index:7000" onClick=${(ev) => { if (ev.target === ev.currentTarget) setCronChurnHelpOpen(false); }}>
                <div class="modal-dialog modal-dialog-scrollable modal-lg">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">
                                <i class="ti ti-help-circle me-2"></i>
                                How to read Cron Churn
                            </h5>
                            <button class="btn-close" aria-label="Close" onClick=${() => setCronChurnHelpOpen(false)}></button>
                        </div>
                        <div class="modal-body">
                            <div class="alert alert-info d-flex mb-3" role="alert">
                                <div class="me-2"><i class="ti ti-chart-line"></i></div>
                                <div>
                                    Use this card to separate real workload growth from accidental table churn. A healthy spike usually moves Processed and CRUD together; a suspicious spike moves Reads or Writes while Processed stays flat.
                                </div>
                            </div>

                            <div class="row g-3 mb-3">
                                <div class="col-md-6">
                                    <div class="subheader mb-2">Metric definitions</div>
                                    <div class="table-responsive">
                                        <table class="table table-sm align-middle mb-0">
                                            <tbody>
                                                <tr>
                                                    <td class="fw-semibold text-nowrap">CRUD ops</td>
                                                    <td>Storage pressure: rows scanned, read, written, and deleted. It is the best first view for cost or scale regressions.</td>
                                                </tr>
                                                <tr>
                                                    <td class="fw-semibold text-nowrap">Processed</td>
                                                    <td>Logical workload handled by the job. It is not read plus write. One processed item can create many table rows.</td>
                                                </tr>
                                                <tr>
                                                    <td class="fw-semibold text-nowrap">Reads</td>
                                                    <td>Rows read by the job. In this card, scan pressure is counted with reads because scans also consume table capacity.</td>
                                                </tr>
                                                <tr>
                                                    <td class="fw-semibold text-nowrap">Writes</td>
                                                    <td>Rows inserted, updated, or upserted by the job. Repeated writes with flat Processed often mean a dirty-row loop.</td>
                                                </tr>
                                                <tr>
                                                    <td class="fw-semibold text-nowrap">Est. cost</td>
                                                    <td>Approximate cost combines Azure Tables operation cost from CRUD counters and Azure Container Apps active CPU/memory runtime from run duration. The chart overlays accumulated total cost by default; tooltips show storage and compute for the hour. It is directional, not the Azure bill.</td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                                <div class="col-md-6">
                                    <div class="subheader mb-2">Bad patterns</div>
                                    <div class="list-group list-group-flush border rounded">
                                        <div class="list-group-item">
                                            <div class="fw-semibold">Reads jump, Processed is flat</div>
                                            <div class="text-muted small">Likely a broad table scan or missing partition filter.</div>
                                        </div>
                                        <div class="list-group-item">
                                            <div class="fw-semibold">Writes repeat every run</div>
                                            <div class="text-muted small">Likely rows are being marked dirty again instead of settling.</div>
                                        </div>
                                        <div class="list-group-item">
                                            <div class="fw-semibold">Processed jumps with similar CRUD growth</div>
                                            <div class="text-muted small">Usually real workload growth. Check the task card to confirm which job did the work.</div>
                                        </div>
                                        <div class="list-group-item">
                                            <div class="fw-semibold">Other Cron Jobs dominates</div>
                                            <div class="text-muted small">The total is real, but older compacted snapshots did not retain full per-task detail.</div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div class="subheader mb-2">How to use the task cards</div>
                            <div class="row g-2">
                                <div class="col-md-4">
                                    <div class="border rounded p-2 h-100">
                                        <div class="fw-semibold mb-1">Find the owner</div>
                                        <div class="text-muted small">The cards are ranked by CRUD pressure. Start at the top card when a chart line spikes.</div>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="border rounded p-2 h-100">
                                        <div class="fw-semibold mb-1">Compare badges</div>
                                        <div class="text-muted small">Read, write, delete, and processed light pills are factual counters. The progress bar carries the state: green for normal churn, yellow for suspicious churn, red for bad churn, and blue for aggregated residual churn.</div>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="border rounded p-2 h-100">
                                        <div class="fw-semibold mb-1">Use controls as lenses</div>
                                        <div class="text-muted small">The card loads ninety days once. Use the dropdown to slice it locally, switch CRUD, Reads, Writes, or Processed for the main lines, and turn Cost off only when the overlay is in the way.</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button class="btn btn-secondary" onClick=${() => setCronChurnHelpOpen(false)}>Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    function renderCronChurnTaskModal() {
        const task = selectedCronChurnTask;
        if (!task) return null;

        const signals = getCronChurnTaskSignals(task);
        const close = () => setSelectedCronChurnTask(null);
        const taskCostParts = splitCronCost(task, cronChurnCostModel);
        const taskEstimatedCost = taskCostParts.totalCost;
        const taskAverageRunCost = task.auditEvents > 0 ? taskEstimatedCost / task.auditEvents : 0;

        return html`
            <div class="modal modal-blur show d-block" tabindex="-1" style="background:rgba(0,0,0,.5);z-index:7000" onClick=${(ev) => { if (ev.target === ev.currentTarget) close(); }}>
                <div class="modal-dialog modal-dialog-scrollable">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">
                                <span class="cron-audit-task-swatch me-2" style=${`background:${task.color || OTHER_CRON_TASK_COLOR}`}></span>
                                ${task.label}
                            </h5>
                            <button class="btn-close" aria-label="Close" onClick=${close}></button>
                        </div>
                        <div class="modal-body">
                            <p class="text-muted mb-3">
                                This card is one plotted series in the Cron Churn chart for the selected window. It shows how much storage pressure this job created and whether that pressure matches the logical work it processed.
                            </p>

                            <div class="row g-2 mb-3">
                                <div class="col-6 col-md-3">
                                    <div class="border rounded p-2 h-100">
                                        <div class="subheader">CRUD ops</div>
                                        <div class="h3 mb-0">${formatCompactNumber(task.crudOps)}</div>
                                    </div>
                                </div>
                                <div class="col-6 col-md-3">
                                    <div class="border rounded p-2 h-100">
                                        <div class="subheader">Processed</div>
                                        <div class="h3 mb-0">${formatCompactNumber(task.eventsProcessed)}</div>
                                    </div>
                                </div>
                                <div class="col-6 col-md-3">
                                    <div class="border rounded p-2 h-100">
                                        <div class="subheader">Reads</div>
                                        <div class="h3 mb-0">${formatCompactNumber(task.rowsRead)}</div>
                                    </div>
                                </div>
                                <div class="col-6 col-md-3">
                                    <div class="border rounded p-2 h-100">
                                        <div class="subheader">Writes</div>
                                        <div class="h3 mb-0">${formatCompactNumber(task.rowsWritten)}</div>
                                    </div>
                                </div>
                                <div class="col-6 col-md-3">
                                    <div class="border rounded p-2 h-100">
                                        <div class="subheader">Total cost</div>
                                        <div class="h3 mb-0">${formatUsd(taskEstimatedCost)}</div>
                                        <div class="text-muted small">storage ${formatUsd(taskCostParts.storageCost)} · compute ${formatUsd(taskCostParts.computeCost)}</div>
                                    </div>
                                </div>
                                <div class="col-6 col-md-3">
                                    <div class="border rounded p-2 h-100">
                                        <div class="subheader">Avg/run</div>
                                        <div class="h3 mb-0">${formatUsd(taskAverageRunCost)}</div>
                                    </div>
                                </div>
                            </div>

                            <div class="subheader mb-2">What good and bad look like</div>
                            <div class="list-group list-group-flush border rounded mb-3">
                                ${signals.map((signal) => html`
                                    <div class="list-group-item">
                                        <div class="d-flex align-items-center gap-2 mb-1">
                                            <span class=${`badge ${signal.badgeClass}`}>${signal.tone}</span>
                                            <div class="fw-semibold">${signal.title}</div>
                                        </div>
                                        <div class="text-muted small">${signal.description}</div>
                                    </div>
                                `)}
                            </div>

                            <div class="alert alert-light border mb-0">
                                <div class="fw-semibold mb-1">Quick read</div>
                                <div class="small text-muted">
                                    Healthy patterns usually show Processed moving with Reads and Writes. Suspicious patterns show Reads or Writes growing while Processed stays flat, or repeated Writes on every run with no new workload.
                                </div>
                            </div>
                        </div>
                        <div class="modal-footer">
                            <button class="btn btn-secondary" onClick=${close}>Close</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    const renderCronChurnTrendCard = () => html`
        <div class="card cron-hourly-crud-card">
            <div class="card-header">
                <div>
                    <h3 class="card-title mb-0">Cron Churn Trend</h3>
                    <div class="card-subtitle text-muted cron-trend-readline">${hourlyCronChurnTrend.sourceLabel} grouped by hour and task</div>
                </div>
                <div class="card-actions d-flex flex-wrap align-items-center gap-2">
                    <div class="btn-group btn-group-sm" role="group" aria-label="Audit churn metric">
                        ${AUDIT_CHURN_METRICS.map((metric) => html`
                            <button
                                type="button"
                                class=${`btn ${auditChurnMetric === metric.key ? 'btn-primary' : 'btn-outline-primary'}`}
                                aria-pressed=${auditChurnMetric === metric.key ? 'true' : 'false'}
                                onClick=${() => setAuditChurnMetric(metric.key)}>
                                ${metric.label}
                            </button>
                        `)}
                    </div>
                    <div class="dropdown">
                        <button
                            type="button"
                            class="btn btn-sm btn-outline-secondary dropdown-toggle"
                            data-bs-toggle="dropdown"
                            aria-expanded="false"
                            aria-label="Cron churn focus">
                            ${getCronChurnFocusOption(cronChurnFocusKey).shortLabel}
                        </button>
                        <div class="dropdown-menu dropdown-menu-end">
                            ${CRON_CHURN_FOCUS_OPTIONS.map((option) => html`
                                <button
                                    type="button"
                                    class=${`dropdown-item ${cronChurnFocusKey === option.key ? 'active' : ''}`}
                                    aria-current=${cronChurnFocusKey === option.key ? 'true' : 'false'}
                                    onClick=${() => setCronChurnFocusKey(option.key)}>
                                    <span>${option.label}</span>
                                    <span class="text-muted ms-2">${option.shortLabel}</span>
                                </button>
                            `)}
                        </div>
                    </div>
                    <label class="form-check form-switch mb-0 d-flex align-items-center gap-1" title="Show accumulated estimated total cost from Azure Tables and Container Apps runtime">
                        <input
                            class="form-check-input m-0"
                            type="checkbox"
                            checked=${showCronChurnCost}
                            onChange=${(event) => setShowCronChurnCost(Boolean(event.currentTarget.checked))}
                            aria-label="Show accumulated estimated cost" />
                        <span class="form-check-label small">Cost</span>
                    </label>
                    ${showCronChurnCost && html`
                        <div class="dropdown">
                            <button
                                type="button"
                                class="btn btn-sm btn-outline-secondary dropdown-toggle"
                                data-bs-toggle="dropdown"
                                aria-expanded="false"
                                aria-label="Cron churn cost attribution">
                                ${getCronChurnCostModeOption(cronChurnCostModeKey).shortLabel}
                            </button>
                            <div class="dropdown-menu dropdown-menu-end">
                                ${CRON_CHURN_COST_MODE_OPTIONS.map((option) => html`
                                    <button
                                        type="button"
                                        class=${`dropdown-item ${cronChurnCostModeKey === option.key ? 'active' : ''}`}
                                        aria-current=${cronChurnCostModeKey === option.key ? 'true' : 'false'}
                                        onClick=${() => setCronChurnCostModeKey(option.key)}>
                                        <span>${option.label}</span>
                                        <span class="text-muted ms-2">${option.shortLabel}</span>
                                    </button>
                                `)}
                            </div>
                        </div>
                    `}
                    <button
                        type="button"
                        class="btn btn-sm btn-icon btn-outline-secondary"
                        title=${loadingCronChurnTrend ? 'Refreshing Cron Churn' : 'Refresh Cron Churn'}
                        aria-label="Refresh Cron Churn"
                        disabled=${loadingCronChurnTrend}
                        onClick=${loadCronChurnTrend}>
                        <i class=${`ti ${loadingCronChurnTrend ? 'ti-loader-2' : 'ti-refresh'}`}></i>
                    </button>
                    <div class="dropdown">
                        <button
                            type="button"
                            class="btn btn-sm btn-outline-primary dropdown-toggle"
                            data-bs-toggle="dropdown"
                            aria-expanded="false"
                            aria-label="Cron churn window">
                            ${getCronChurnWindowOption(cronChurnWindowKey).shortLabel}
                        </button>
                        <div class="dropdown-menu dropdown-menu-end">
                            ${CRON_CHURN_WINDOW_OPTIONS.map((option) => html`
                                <button
                                    type="button"
                                    class=${`dropdown-item ${cronChurnWindowKey === option.key ? 'active' : ''}`}
                                    aria-current=${cronChurnWindowKey === option.key ? 'true' : 'false'}
                                    onClick=${() => setCronChurnWindowKey(option.key)}>
                                    <span>${option.label}</span>
                                    <span class="text-muted ms-2">${option.shortLabel}</span>
                                </button>
                            `)}
                        </div>
                    </div>
                    <button
                        type="button"
                        class="btn btn-sm btn-outline-secondary"
                        title="How to read Cron Churn"
                        aria-label="How to read Cron Churn"
                        onClick=${() => setCronChurnHelpOpen(true)}>
                        <i class="ti ti-help-circle me-1"></i>
                        How to read
                    </button>
                </div>
            </div>
            <div class="card-body">
                ${hourlyCronChurnTrend.points.length === 0 || hourlyCronChurnTrend.tasks.length === 0 ? html`
                    <div class="empty py-3">
                        <div class="empty-icon"><i class="ti ti-chart-bar-off"></i></div>
                        <p class="empty-title">No cron churn rows</p>
                    </div>
                ` : html`
                    <div class="cron-trend-stack">
                        <div class="cron-trend-section">
                            <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
                                <div>
                                    <div class="subheader mb-0">${hourlyCronChurnTrend.selectedMetric.label} By Cron Job</div>
                                    <div class="text-muted small">${hourlyCronChurnTrend.spanLabel}</div>
                                </div>
                                <div class="d-flex flex-wrap gap-1">
                                    <span class="badge bg-secondary-lt text-secondary">reads ${formatCompactNumber(hourlyCronChurnTrend.totals.rowsRead)}</span>
                                    <span class="badge bg-success-lt text-success">writes ${formatCompactNumber(hourlyCronChurnTrend.totals.rowsWritten)}</span>
                                    <span class="badge bg-info-lt text-info">processed ${formatCompactNumber(hourlyCronChurnTrend.totals.eventsProcessed)}</span>
                                    <span class="badge bg-primary-lt text-primary">total ${formatUsd(cronChurnTotalCostParts.totalCost)}</span>
                                    <span class="badge bg-secondary-lt text-secondary">storage ${formatUsd(cronChurnTotalCostParts.storageCost)}</span>
                                    <span class="badge bg-info-lt text-info">compute ${formatUsd(cronChurnTotalCostParts.computeCost)}</span>
                                    <span class="badge bg-success-lt text-success">regular ${formatUsd(cronChurnTotalCostParts.regularTotalCost)}</span>
                                    <span class="badge bg-warning-lt text-warning">manual ${formatUsd(cronChurnTotalCostParts.manualRecoveryTotalCost)}</span>
                                </div>
                            </div>
                            <div class="cron-audit-churn-chart" role="img" aria-label="Hourly cron audit read write and processed event trend">
                                <canvas id="cronAuditChurnLineChart" ref=${auditChurnCanvasRef}></canvas>
                            </div>
                            <div class="d-flex flex-wrap gap-2 mt-2">
                                <span class="badge bg-purple-lt text-purple">${hourlyCronChurnTrend.eventNoun || 'audit event'}s ${formatCompactNumber(hourlyCronChurnTrend.totals.auditEvents)}</span>
                                <span class="badge bg-info-lt text-info">processed ${formatCompactNumber(hourlyCronChurnTrend.totals.eventsProcessed)}</span>
                                <span class="badge bg-secondary-lt text-secondary">reads ${formatCompactNumber(hourlyCronChurnTrend.totals.rowsRead)}</span>
                                <span class="badge bg-success-lt text-success">writes ${formatCompactNumber(hourlyCronChurnTrend.totals.rowsWritten)}</span>
                                ${hourlyCronChurnTrend.totals.rowsDeleted > 0 && html`<span class="badge bg-warning-lt text-warning">deletes ${formatCompactNumber(hourlyCronChurnTrend.totals.rowsDeleted)}</span>`}
                                <span class="badge bg-primary-lt text-primary">total cost ${formatUsd(cronChurnTotalCostParts.totalCost)}</span>
                                <span class="badge bg-secondary-lt text-secondary">storage cost ${formatUsd(cronChurnTotalCostParts.storageCost)}</span>
                                <span class="badge bg-info-lt text-info">compute cost ${formatUsd(cronChurnTotalCostParts.computeCost)}</span>
                                <span class="badge bg-success-lt text-success">regular cost ${formatUsd(cronChurnTotalCostParts.regularTotalCost)}</span>
                                <span class="badge bg-warning-lt text-warning">manual cost ${formatUsd(cronChurnTotalCostParts.manualRecoveryTotalCost)}</span>
                            </div>
                        </div>
                        <div class="cron-audit-task-list">
                            ${hourlyCronChurnTrend.tasks.map((task) => {
                                const rowShare = Math.max(1, Math.round((task.crudOps / hourlyCronChurnTrend.maxCrudOps) * 100));
                                const taskHealth = getCronChurnTaskHealth(task);
                                return html`
                                    <div class="cron-audit-task-row">
                                        <div>
                                            <div class="d-flex align-items-start justify-content-between gap-2">
                                                <div class="d-flex align-items-center gap-2 min-w-0">
                                                    <span class="cron-audit-task-swatch" style=${`background:${task.color}`}></span>
                                                    <div class="fw-semibold text-truncate cron-audit-task-title">${task.label}</div>
                                                </div>
                                                <button
                                                    type="button"
                                                    class="btn btn-sm btn-icon btn-outline-secondary flex-shrink-0"
                                                    title=${`Explain ${task.label}`}
                                                    aria-label=${`Explain ${task.label}`}
                                                    onClick=${() => setSelectedCronChurnTask(task)}>
                                                    <i class="ti ti-info-circle"></i>
                                                </button>
                                            </div>
                                            <div class="small cron-audit-task-meta">${formatCompactNumber(task.crudOps)} CRUD ops · ${formatPlural(task.auditEvents, hourlyCronChurnTrend.eventNoun || 'audit event')}</div>
                                        </div>
                                        <div class=${`progress progress-sm my-2 cron-audit-progress ${taskHealth.progressClass}`} title=${taskHealth.label} aria-label=${`${task.label} churn share: ${rowShare}%, ${taskHealth.label}`}>
                                            <div class="progress-bar" style=${`width:${rowShare}%`}></div>
                                        </div>
                                        <div class="d-flex flex-wrap gap-1">
                                            <span class="badge bg-info-lt text-info">processed ${formatCompactNumber(task.eventsProcessed)}</span>
                                            <span class="badge bg-secondary-lt text-secondary">read ${formatCompactNumber(task.rowsRead)}</span>
                                            <span class="badge bg-success-lt text-success">write ${formatCompactNumber(task.rowsWritten)}</span>
                                            ${task.rowsDeleted > 0 && html`<span class="badge bg-warning-lt text-warning">delete ${formatCompactNumber(task.rowsDeleted)}</span>`}
                                            <span class="badge bg-primary-lt text-primary">est ${formatUsd(estimateCronRunCostUsd(task, cronChurnCostModel))}</span>
                                        </div>
                                    </div>
                                `;
                            })}
                        </div>
                    </div>
                `}
            </div>
        </div>
    `;

    return html`
        ${showHeader && html`<div class="page-header d-print-none mb-3">
            <div class="container-xl">
                <div class="row g-2 align-items-center">
                    <div class="col">
                        <h2 class="page-title">
                            <svg xmlns="http://www.w3.org/2000/svg" class="icon me-2" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 15" /></svg>
                            Cron Activity
                        </h2>
                        <div class="page-subtitle">
                            <span class="text-muted">View scheduled lane leases, task progress, manual runs, and report email activity</span>
                        </div>
                    </div>
                    <div class="col-auto">
                        <button class="btn btn-outline-primary" onClick=${() => openTraceModal('', '')}>
                            <i class="ti ti-list-search me-2"></i>
                            Query Trace
                        </button>
                    </div>
                </div>
            </div>
        </div>`}

        <div ref=${cronActivityRootRef} class=${embedded ? 'cron-activity-page' : 'container-xl cron-activity-page'}>
            <!-- Summary Statistics -->
            ${events.length > 0 && html`
                <div class="row g-3 mb-3">
                    ${(() => {
                        const sampleCount = filteredEvents.length;
                        const totalEvents = events.length;
                        const successCount = filteredEvents.filter((event) => {
                            if (event.eventType === 'CRONRUN') {
                                const status = (event.metadata?.status || event.metadata?.Status || event.status || '').toLowerCase();
                                return status === '' || status === 'completed';
                            }

                            return event.eventType === 'SECURITY_REPORT' && ((event.subType || '').toLowerCase().includes('failed')) === false;
                        }).length;
                        const failureCount = filteredEvents.filter((event) => {
                            if (event.eventType === 'CRONRUN') {
                                const status = (event.metadata?.status || event.metadata?.Status || event.status || '').toLowerCase();
                                return ['failed', 'exception', 'rejected'].includes(status);
                            }

                            return event.eventType === 'SECURITY_REPORT' && event.subType === 'SecurityReportFailed';
                        }).length;
                        const successRate = sampleCount > 0 ? ((successCount / sampleCount) * 100).toFixed(1) : 0;
                        const lastEvent = filteredEvents[0] || events[0];
                        const lastEventTime = lastEvent?.timestamp ? new Date(lastEvent.timestamp) : null;
                        const sampleLabel = sampleCount === totalEvents
                            ? `${formatPlural(sampleCount, 'event')} loaded`
                            : `${formatCompactNumber(sampleCount)} visible of ${formatCompactNumber(totalEvents)} loaded`;
                        const totalRowOps = runtimeTrend.totals.rowsRead + runtimeTrend.totals.rowsWritten + runtimeTrend.totals.rowsDeleted;
                        const topTask = taskRuntimeLeaders[0] || null;
                        const hotspotTitle = topTask
                            ? `${topTask.taskId}: ${formatDuration(topTask.totalDurationMs)} total, ${formatCompactNumber(topTask.totalRows)} row ops, ${formatPlural(topTask.runs, 'run')}`
                            : topLaneByRuntime
                                ? `${formatLaneLabel(topLaneByRuntime.laneId)}: ${formatDuration(topLaneByRuntime.durationMs)}, ${formatCompactNumber(topLaneByRuntime.totalRows)} ops`
                                : 'No timed task or lane hotspot in the loaded sample.';
                        const healthTitle = `${sampleLabel}\n${successCount} success / ${failureCount} failed in ${formatSampleWindow(rangeDays)}`;
                        const costTitle = `Estimated total ${formatUsd(cronChurnTotalCostParts.totalCost)}\nCompute ${formatUsd(cronChurnTotalCostParts.computeCost)} from timed runtime\nStorage ${formatUsd(cronChurnTotalCostParts.storageCost)} from table operations`;
                        
                        return html`
                            <div class="col-md-3">
                                <div class="card h-100" title=${healthTitle}>
                                    <div class="card-body">
                                        <div class="d-flex justify-content-between align-items-center gap-2 mb-2">
                                            <div class="subheader mb-0">Run health</div>
                                            ${failureCount > 0 ? html`<span class="badge bg-danger-lt text-danger">review</span>` : html`<span class="badge bg-success-lt text-success">healthy</span>`}
                                        </div>
                                        <div class=${`h3 mb-0 ${failureCount > 0 ? 'text-danger' : 'text-success'}`}>${successRate}%</div>
                                        <small class="text-muted">${successCount} ok · ${failureCount} failed · ${formatCompactNumber(sampleCount)} events</small>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="card h-100" title=${costTitle}>
                                    <div class="card-body">
                                        <div class="subheader mb-2">Estimated cost</div>
                                        <div class="h3 mb-0 text-primary">${formatUsd(cronChurnTotalCostParts.totalCost)}</div>
                                        <small class="text-muted">${formatUsd(cronChurnTotalCostParts.computeCost)} compute · ${formatUsd(cronChurnTotalCostParts.storageCost)} storage</small>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="card h-100" title=${`${formatCompactNumber(totalRowOps)} table operations\n${formatCompactNumber(runtimeTrend.totals.rowsRead)} read/scanned, ${formatCompactNumber(runtimeTrend.totals.rowsWritten)} written, ${formatCompactNumber(runtimeTrend.totals.rowsDeleted)} deleted`}>
                                    <div class="card-body">
                                        <div class="subheader mb-2">Storage pressure</div>
                                        <div class="h3 mb-0 text-warning">${formatCompactNumber(totalRowOps)}</div>
                                        <small class="text-muted">${formatCompactNumber(runtimeTrend.totals.rowsRead)} read · ${formatCompactNumber(runtimeTrend.totals.rowsWritten)} write</small>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="card h-100" title=${hotspotTitle}>
                                    <div class="card-body">
                                        <div class="d-flex justify-content-between align-items-center gap-2 mb-2">
                                            <div class="subheader mb-0">Hotspot</div>
                                            <span class="badge bg-info-lt text-info">${formatRelativeTime(lastEventTime)}</span>
                                        </div>
                                        <div class="h3 mb-0 text-truncate">${topTask?.taskId || (topLaneByRuntime ? formatLaneLabel(topLaneByRuntime.laneId) : '-')}</div>
                                        <small class="text-muted">${topTask ? `${formatDuration(topTask.totalDurationMs)} · ${formatCompactNumber(topTask.totalRows)} ops` : (topLaneByRuntime ? `${formatDuration(topLaneByRuntime.durationMs)} lane runtime` : 'No hotspot yet')}</small>
                                    </div>
                                </div>
                            </div>
                        `;
                    })()}
                </div>
            `}

            ${filteredEvents.length > 0 && html`
                <div class="row g-3 mb-3">
                    <div class="col-12">
                        ${renderCronChurnTrendCard()}
                    </div>
                    <div class="col-xl-6 d-flex flex-column gap-3">
                        <div class="card cron-runtime-trend-card">
                            <div class="card-header">
                                <div>
                                    <h3 class="card-title mb-0">Runtime Trend</h3>
                                    <div class="card-subtitle text-muted cron-trend-readline">${formatSampleWindow(rangeDays)} filtered sample</div>
                                </div>
                                <div class="card-actions text-muted small">
                                    ${formatDuration(runtimeTrend.totals.durationMs)} sampled runtime · ${formatPlural(runtimeTrend.totals.runs, 'timed run')}
                                </div>
                            </div>
                            <div class="card-body">
                                <div class="cron-insight-strip mb-3">
                                    ${efficiencyTrend.peakRuntimeDay && html`
                                        <div class="cron-insight-pill" title=${`${efficiencyTrend.peakRuntimeDay.label}: ${formatDuration(efficiencyTrend.peakRuntimeDay.durationMs)} sampled runtime`}>
                                            <span class="text-muted small">Peak runtime</span>
                                            <span class="fw-semibold">${efficiencyTrend.peakRuntimeDay.label}</span>
                                        </div>
                                    `}
                                    ${efficiencyTrend.peakOpsDay && efficiencyTrend.peakOpsDay.rowOps > 0 && html`
                                        <div class="cron-insight-pill" title=${`${efficiencyTrend.peakOpsDay.label}: ${formatCompactNumber(efficiencyTrend.peakOpsDay.rowOps)} row operations`}>
                                            <span class="text-muted small">Peak ops</span>
                                            <span class="fw-semibold">${formatCompactNumber(efficiencyTrend.peakOpsDay.rowOps)}</span>
                                        </div>
                                    `}
                                    ${efficiencyTrend.peakEfficiencyDay && efficiencyTrend.peakEfficiencyDay.workPerMinute > 0 && html`
                                        <div class="cron-insight-pill" title=${`${efficiencyTrend.peakEfficiencyDay.label}: ${formatCompactNumber(efficiencyTrend.peakEfficiencyDay.workPerMinute)} work/min`}>
                                            <span class="text-muted small">Best throughput</span>
                                            <span class="fw-semibold">${formatCompactNumber(efficiencyTrend.peakEfficiencyDay.workPerMinute)}/min</span>
                                        </div>
                                    `}
                                </div>
                                <div class="cron-trend-stack">
                                    <div class="cron-trend-section" title="Daily scheduled/manual run volume. Failed segments indicate runs that ended unsuccessfully.">
                                        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
                                            <div class="subheader mb-0">Executions</div>
                                            <div class="d-flex flex-wrap gap-1">
                                                <span class="badge bg-success text-white">success</span>
                                                <span class="badge bg-danger text-white">failed</span>
                                            </div>
                                        </div>
                                        <div class="cron-trend-chart cron-trend-chart-compact" role="img" aria-label="Daily cron execution trend">
                                            ${dailyTrend.points.map((point) => {
                                                const successHeight = Math.max(2, Math.round((point.success / dailyTrend.max) * 30));
                                                const failedHeight = Math.max(point.failed > 0 ? 2 : 0, Math.round((point.failed / dailyTrend.max) * 30));
                                                const totalHeight = Math.min(36, successHeight + failedHeight);
                                                return html`
                                                    <div class="cron-trend-day" title=${`${point.label}: ${point.success} success, ${point.failed} failed, ${point.manual} manual, ${point.scheduled} scheduled`}>
                                                        <div class="cron-trend-bar" style=${`height:${Math.max(2, totalHeight)}px`}>
                                                            ${point.failed > 0 && html`<div class="cron-trend-segment cron-trend-failed" style=${`height:${failedHeight}px`}></div>`}
                                                            ${point.success > 0 && html`<div class="cron-trend-segment cron-trend-success" style=${`height:${successHeight}px`}></div>`}
                                                        </div>
                                                        <div class="cron-trend-label">${point.label}</div>
                                                    </div>
                                                `;
                                            })}
                                        </div>
                                        <div class="small text-muted mt-2">${dailyTrend.totals.success} completed · ${dailyTrend.totals.failed} failed</div>
                                    </div>
                                    <div class="cron-trend-section" title="Elapsed cron runtime beside table read/write/delete pressure.">
                                        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
                                            <div class="subheader mb-0">Runtime</div>
                                            <div class="d-flex flex-wrap gap-1">
                                                <span class="badge bg-primary text-white">runtime</span>
                                                <span class="badge bg-warning text-white">table ops</span>
                                            </div>
                                        </div>
                                        <div class="cron-trend-chart cron-trend-chart-compact" role="img" aria-label="Daily cron runtime and table operation trend">
                                            ${runtimeTrend.points.map((point) => {
                                                const durationHeight = Math.max(point.durationMs > 0 ? 3 : 0, Math.round((point.durationMs / runtimeTrend.maxDurationMs) * 34));
                                                const rowHeight = Math.max((point.rowsRead + point.rowsWritten + point.rowsDeleted) > 0 ? 2 : 0, Math.round(((point.rowsRead + point.rowsWritten + point.rowsDeleted) / runtimeTrend.maxRows) * 10));
                                                return html`
                                                    <div class="cron-trend-day" title=${`${point.label}: ${formatDuration(point.durationMs)}, ${point.runs} timed runs, ${formatCompactNumber(point.rowsRead + point.rowsWritten + point.rowsDeleted)} row ops`}>
                                                        <div class="cron-trend-bar" style=${`height:${Math.max(2, durationHeight + rowHeight)}px`}>
                                                            ${rowHeight > 0 && html`<div class="cron-trend-segment cron-trend-rows" style=${`height:${rowHeight}px`}></div>`}
                                                            ${durationHeight > 0 && html`<div class="cron-trend-segment cron-trend-runtime" style=${`height:${durationHeight}px`}></div>`}
                                                        </div>
                                                        <div class="cron-trend-label">${point.label}</div>
                                                    </div>
                                                `;
                                            })}
                                        </div>
                                        <div class="d-flex flex-wrap gap-2 mt-2">
                                            <span class="badge bg-primary text-white">runtime ${formatDuration(runtimeTrend.totals.durationMs)}</span>
                                            <span class="badge bg-info text-white">work ${formatCompactNumber(runtimeTrend.totals.itemsProcessed)} items</span>
                                            <span class="badge bg-secondary text-white">reads ${formatCompactNumber(runtimeTrend.totals.rowsRead)}</span>
                                            <span class="badge bg-success text-white">writes ${formatCompactNumber(runtimeTrend.totals.rowsWritten)}</span>
                                            ${runtimeTrend.totals.rowsDeleted > 0 && html`<span class="badge bg-warning text-white">deletes ${formatCompactNumber(runtimeTrend.totals.rowsDeleted)}</span>`}
                                        </div>
                                    </div>
                                    <div class="cron-trend-section cron-trend-section-tight" title="Work completed and table operations per runtime minute.">
                                        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-2">
                                            <div class="subheader mb-0">Efficiency</div>
                                            <div class="d-flex flex-wrap gap-1">
                                                <span class="badge bg-success text-white">work/min</span>
                                                <span class="badge bg-warning text-white">ops/min</span>
                                            </div>
                                        </div>
                                        <div class="cron-trend-chart cron-trend-chart-compact cron-trend-chart-tiny" role="img" aria-label="Daily cron work and operation efficiency trend">
                                            ${efficiencyTrend.points.map((point) => {
                                                const workHeight = Math.max(point.workPerMinute > 0 ? 2 : 0, Math.round((point.workPerMinute / efficiencyTrend.maxWorkPerMinute) * 28));
                                                const opsHeight = Math.max(point.opsPerMinute > 0 ? 2 : 0, Math.round((point.opsPerMinute / efficiencyTrend.maxOpsPerMinute) * 9));
                                                return html`
                                                    <div class="cron-trend-day" title=${`${point.label}: ${formatCompactNumber(point.workPerMinute)} work/min, ${formatCompactNumber(point.opsPerMinute)} ops/min`}>
                                                        <div class="cron-trend-bar" style=${`height:${Math.max(2, workHeight + opsHeight)}px`}>
                                                            ${opsHeight > 0 && html`<div class="cron-trend-segment cron-trend-efficiency-ops" style=${`height:${opsHeight}px`}></div>`}
                                                            ${workHeight > 0 && html`<div class="cron-trend-segment cron-trend-work" style=${`height:${workHeight}px`}></div>`}
                                                        </div>
                                                        <div class="cron-trend-label">${point.label}</div>
                                                    </div>
                                                `;
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="card">
                            <div class="card-header">
                                <div>
                                    <h3 class="card-title mb-0">Attribution Signals</h3>
                                    <div class="card-subtitle text-muted">What is driving runtime, storage, and manual/recovery cost.</div>
                                </div>
                            </div>
                            <div class="card-body">
                                <div class="cron-attribution-tiles">
                                    <div class="cron-attribution-tile" title=${`Timed runtime ${formatDuration(runtimeTrend.totals.durationMs)}. Compute estimate ${formatUsd(cronChurnTotalCostParts.computeCost)}.`}>
                                        <div class="text-muted small">Compute driver</div>
                                        <div class="h3 mb-0 text-primary">${formatDuration(runtimeTrend.totals.durationMs)}</div>
                                        <div class="text-muted small">${formatUsd(cronChurnTotalCostParts.computeCost)} est.</div>
                                    </div>
                                    <div class="cron-attribution-tile" title=${`${formatCompactNumber(runtimeTrend.totals.rowsRead)} read/scanned, ${formatCompactNumber(runtimeTrend.totals.rowsWritten)} written, ${formatCompactNumber(runtimeTrend.totals.rowsDeleted)} deleted. Storage estimate ${formatUsd(cronChurnTotalCostParts.storageCost)}.`}>
                                        <div class="text-muted small">Storage Pressure</div>
                                        <div class="h3 mb-0 text-warning">${formatCompactNumber(runtimeTrend.totals.rowsRead + runtimeTrend.totals.rowsWritten + runtimeTrend.totals.rowsDeleted)}</div>
                                        <div class="text-muted small">${formatUsd(cronChurnTotalCostParts.storageCost)} est.</div>
                                    </div>
                                    <div class="cron-attribution-tile" title="Logical work completed by cron runs. High work with low ops is good; high ops with low work is a tuning signal.">
                                        <div class="text-muted small">Workload Driver</div>
                                        <div class="h3 mb-0 text-success">${formatCompactNumber(runtimeTrend.totals.itemsProcessed)}</div>
                                        <div class="text-muted small">${formatPlural(runtimeTrend.totals.runs, 'timed run')}</div>
                                    </div>
                                    <div class="cron-attribution-tile" title=${topLaneByRuntime ? `${formatLaneLabel(topLaneByRuntime.laneId)} accounts for ${formatDuration(topLaneByRuntime.durationMs)} runtime and ${formatCompactNumber(topLaneByRuntime.totalRows)} ops.` : 'No lane runtime available.'}>
                                        <div class="text-muted small">Top Lane</div>
                                        <div class="h3 mb-0">${topLaneByRuntime ? formatLaneLabel(topLaneByRuntime.laneId) : '-'}</div>
                                        <div class="text-muted small">${topLaneByRuntime ? formatDuration(topLaneByRuntime.durationMs) : 'no timed runs'}</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="col-xl-6">
                        <div class="card h-100">
                            <div class="card-header">
                                <h3 class="card-title mb-0">Runtime By Task</h3>
                                <div class="card-actions text-muted small">${formatSampleWindow(rangeDays)} sample</div>
                            </div>
                            <div class="card-body">
                                ${taskRuntimeLeaders.length === 0 ? html`
                                    <div class="empty py-3">
                                        <div class="empty-icon"><i class="ti ti-chart-bar-off"></i></div>
                                        <p class="empty-title">No timed task runs</p>
                                    </div>
                                ` : html`
                                    <div class="list-group list-group-flush cron-runtime-leader-list">
                                        ${taskRuntimeLeaders.map((item) => {
                                            const runtimeShare = Math.max(1, Math.round((item.totalDurationMs / maxTaskDurationMs) * 100));
                                            const sampleShare = totalTaskDurationMs > 0 ? Math.round((item.totalDurationMs / totalTaskDurationMs) * 100) : 0;
                                            return html`
                                            <div class="list-group-item px-0" title=${`${item.taskId}\nTotal runtime ${formatDuration(item.totalDurationMs)}\nAverage ${formatDuration(item.averageDurationMs)}; max ${formatDuration(item.maxDurationMs)}\nRows ${formatCompactNumber(item.totalRows)}; work ${formatCompactNumber(item.itemsProcessed)}`}>
                                                <div class="d-flex align-items-start gap-3">
                                                    <div class="flex-fill" style="min-width:0;">
                                                        <div class="fw-semibold text-truncate" title=${item.taskId}>${item.taskId}</div>
                                                        <div class="d-flex flex-wrap gap-1 mt-2">
                                                            <span class="badge bg-primary-lt text-primary">${formatDuration(item.totalDurationMs)}</span>
                                                            <span class="badge bg-secondary-lt text-secondary">${formatPlural(item.runs, 'run')}</span>
                                                            <span class="badge bg-info-lt text-info">avg ${formatDuration(item.averageDurationMs)}</span>
                                                            ${item.totalRows > 0 && html`<span class="badge bg-warning-lt text-warning">${formatCompactNumber(item.totalRows)} ops</span>`}
                                                        </div>
                                                    </div>
                                                    <div class="text-end">
                                                        <div class="fw-semibold">${sampleShare}%</div>
                                                        <div class="text-muted small">sample</div>
                                                    </div>
                                                </div>
                                                <div class="progress progress-sm mt-2">
                                                    <div class="progress-bar bg-primary" style=${`width:${Math.max(4, runtimeShare)}%`}></div>
                                                </div>
                                            </div>
                                        `})}
                                    </div>
                                    ${taskEfficiencyLeaders.length > 0 && html`
                                        <div class="cron-card-section mt-3 pt-3">
                                            <div class="d-flex align-items-center justify-content-between gap-2 mb-2">
                                                <div class="subheader mb-0">Efficiency</div>
                                                <span class="badge bg-info text-white">per minute</span>
                                            </div>
                                            <div class="cron-efficiency-grid">
                                                ${taskEfficiencyLeaders.map((item) => html`
                                                    <div class="cron-efficiency-item">
                                                        <div class="text-truncate fw-semibold" title=${item.taskId}>${item.taskId}</div>
                                                        <div class="d-flex flex-wrap gap-1 mt-1">
                                                            ${item.workPerMinute > 0 && html`<span class="badge bg-success text-white">work ${formatCompactNumber(item.workPerMinute)}/min</span>`}
                                                            ${item.opsPerMinute > 0 && html`<span class="badge bg-warning text-white">ops ${formatCompactNumber(item.opsPerMinute)}/min</span>`}
                                                        </div>
                                                    </div>
                                                `)}
                                            </div>
                                        </div>
                                    `}
                                `}
                            </div>
                        </div>
                    </div>
                </div>
            `}

            ${laneLoadMix.length > 0 && html`
                <div class="row g-3 mb-3">
                    <div class="col-12 d-flex">
                        <div class="card h-100 w-100">
                            <div class="card-header">
                                <div>
                                    <h3 class="card-title mb-0">Lane Load Mix</h3>
                                    <div class="card-subtitle text-muted">Runtime share, table pressure, and failure cues by lane.</div>
                                </div>
                                <div class="card-actions text-muted small">${formatSampleWindow(rangeDays)} sample</div>
                            </div>
                            <div class="card-body">
                                <div class="cron-lane-load-list">
                                    ${laneLoadMix.map((lane) => {
                                        const runtimePercent = Math.max(1, Math.round((lane.durationMs / maxLaneDurationMs) * 100));
                                        const rowPercent = Math.max(lane.totalRows > 0 ? 1 : 0, Math.round((lane.totalRows / maxLaneRows) * 100));
                                        const runtimeShare = totalLaneDurationMs > 0 ? Math.round((lane.durationMs / totalLaneDurationMs) * 100) : 0;
                                        const rowShare = totalLaneRows > 0 ? Math.round((lane.totalRows / totalLaneRows) * 100) : 0;
                                        return html`
                                            <div class="cron-lane-load-row" title=${`${formatLaneLabel(lane.laneId)}: ${runtimeShare}% runtime share, ${rowShare}% row-op share, ${formatPlural(lane.runs, 'timed run')}, ${lane.failed} failed.`}>
                                                <div class="cron-lane-load-label">
                                                    <div class="fw-semibold">${formatLaneLabel(lane.laneId)}</div>
                                                    <div class="text-muted small">${formatPlural(lane.runs, 'timed run')}${lane.failed > 0 ? ` · ${lane.failed} failed` : ''}</div>
                                                </div>
                                                <div class="cron-lane-load-bars">
                                                    <div class="cron-lane-bar-track" title=${`${formatLaneLabel(lane.laneId)} runtime ${formatDuration(lane.durationMs)}`}>
                                                        <div class="cron-lane-bar-runtime" style=${`width:${Math.max(4, runtimePercent)}%`}></div>
                                                    </div>
                                                    <div class="cron-lane-bar-track" title=${`${formatLaneLabel(lane.laneId)} table operations ${formatCompactNumber(lane.totalRows)}`}>
                                                        <div class="cron-lane-bar-ops" style=${`width:${Math.max(lane.totalRows > 0 ? 4 : 0, rowPercent)}%`}></div>
                                                    </div>
                                                </div>
                                                <div class="cron-lane-load-metrics">
                                                    <span class="badge bg-primary-lt text-primary">${runtimeShare}% runtime</span>
                                                    <span class="badge bg-warning-lt text-warning">${rowShare}% ops</span>
                                                    ${lane.failed > 0 && html`<span class="badge bg-danger-lt text-danger">${lane.failed} failed</span>`}
                                                </div>
                                            </div>
                                        `;
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `}

            ${!cronStatus && html`
                <div class="card mb-3 border-warning">
                    <div class="card-body d-flex flex-wrap justify-content-between align-items-center gap-3">
                        <div>
                            <div class="fw-semibold">Cron status is still loading</div>
                            <div class="text-muted small">Scale Readiness and Lane Status require the live cron status payload from the admin API.</div>
                        </div>
                        <button class="btn btn-sm btn-outline-primary" disabled=${loadingCronStatus} onClick=${loadCronStatus}>
                            ${loadingCronStatus ? html`<span class="spinner-border spinner-border-sm me-1"></span>` : html`<i class="ti ti-refresh me-1"></i>`}
                            Refresh Status
                        </button>
                    </div>
                </div>
            `}

            ${scalePressure && html`
                <div class="row g-3 mb-3">
                    <div class="col-sm-6 col-xl-3">
                        <div class="card h-100" title=${scaleSignalTooltip}>
                            <div class="card-body">
                                <div class="d-flex align-items-center justify-content-between gap-2">
                                    <div class="subheader">SLA pressure</div>
                                    <span class=${`badge ${getScaleSeverityBadgeClass(scalePressure.overallSeverity)}`}>${scalePressure.overallSeverity || 'unknown'}</span>
                                </div>
                                <div class="h2 mb-1 mt-2">${scalePressure.criticalSignals || 0}/${(scalePressure.criticalSignals || 0) + (scalePressure.warningSignals || 0)}</div>
                                <div class="text-muted small">critical / watched signals · ${formatSampleWindow(scalePressure.windowDays || rangeDays)}</div>
                            </div>
                        </div>
                    </div>
                    <div class="col-sm-6 col-xl-3">
                        <div class="card h-100" title=${scaleTopSignal ? `${scaleTopSignal.message || ''}\n${scaleTopSignal.recommendation || ''}` : scaleSignalTooltip}>
                            <div class="card-body">
                                <div class="subheader">Top signal</div>
                                <div class="h3 mb-1 mt-2 text-truncate">${scaleTopSignal?.title || 'Healthy'}</div>
                                <div class="text-muted small text-truncate">${scaleTopSignal?.metricValue ? `${scaleTopSignal.metricLabel || 'metric'}: ${scaleTopSignal.metricValue}` : (scalePressure.summary || 'No warning threshold crossed')}</div>
                            </div>
                        </div>
                    </div>
                    <div class="col-sm-6 col-xl-3">
                        <div class="card h-100" title=${scaleTopTask ? `${scaleTopTask.taskId || 'Task'} latest ${formatDuration(scaleTopTask.latestDurationMs)}; max ${formatDuration(scaleTopTask.maxDurationMs)}; rows ${formatCompactNumber(scaleTopTask.totalRowOps || scaleTopTask.latestRowsScanned || 0)}` : 'No task hotspot rows available yet.'}>
                            <div class="card-body">
                                <div class="subheader">Runtime leader</div>
                                <div class="h3 mb-1 mt-2 text-truncate">${scaleTopTask?.taskId || '-'}</div>
                                <div class="text-muted small">${scaleTopTask ? `${formatDuration(scaleTopTask.latestDurationMs)} latest · ${formatLaneLabel(scaleTopTask.laneId)}` : 'No recent runtime pressure'}</div>
                            </div>
                        </div>
                    </div>
                    <div class="col-sm-6 col-xl-3">
                        <div class="card h-100" title=${`${scaleIndexTooltip}\n${scaleTopLane ? `${formatLaneLabel(scaleTopLane.laneId)} runtime ${formatDuration(scaleTopLane.totalDurationMs)}` : ''}`}>
                            <div class="card-body">
                                <div class="subheader">Fan-out path</div>
                                <div class="h3 mb-1 mt-2">Current AppProduct</div>
                                <div class="text-muted small text-truncate">Existing projection for MODR device lookup</div>
                            </div>
                        </div>
                    </div>
                </div>
            `}

            ${cronStatus && html`
                <div class="card mb-3">
                    <div class="card-header">
                        <div>
                            <h3 class="card-title mb-0">Lane Status</h3>
                            <div class="card-subtitle text-muted">Scheduled lanes run independently; manual jobs are queued separately.</div>
                        </div>
                        <button class="btn btn-sm btn-outline-primary ms-auto" disabled=${loadingCronStatus} onClick=${loadCronStatus}>
                            ${loadingCronStatus ? html`<span class="spinner-border spinner-border-sm me-1"></span>` : html`<i class="ti ti-refresh me-1"></i>`}
                            Refresh Status
                        </button>
                    </div>
                    <div class="card-body">
                        <div class="cron-insight-strip mb-3">
                            <div class="cron-insight-pill" title="Lanes with no overdue scheduled tasks.">
                                <span class="text-muted small">Ready lanes</span>
                                <span class="fw-semibold text-success">${laneStatusSummary.healthy}/${laneSummaries.length}</span>
                            </div>
                            <div class="cron-insight-pill" title="Overdue scheduled tasks across all lanes.">
                                <span class="text-muted small">Overdue tasks</span>
                                <span class=${`fw-semibold ${laneStatusSummary.overdueTasks > 0 ? 'text-danger' : 'text-success'}`}>${laneStatusSummary.overdueTasks}</span>
                            </div>
                            <div class="cron-insight-pill" title=${currentCronStatus.isLocked ? `Active lease held by ${currentCronStatus.lockedBy || 'unknown worker'}` : 'No scheduled lane currently holds the lease.'}>
                                <span class="text-muted small">Running now</span>
                                <span class="fw-semibold">${laneStatusSummary.runningLane ? laneStatusSummary.runningLane.label : 'Idle'}</span>
                            </div>
                        </div>
                        <div class="row g-3 align-items-stretch">
                            <div class="col-lg-4">
                                <div class="border rounded p-3 h-100">
                                    <div class="text-muted small mb-2">Active Lease</div>
                                    ${currentCronStatus.isLocked ? html`
                                        <div class="d-flex flex-wrap gap-2 align-items-center mb-2">
                                            <span class=${`badge ${activeLockExpired ? 'bg-warning text-white' : 'bg-primary text-white'}`}>
                                                ${formatLaneLabel(activeLaneId)}
                                            </span>
                                            ${activeExecutionScope && String(activeExecutionScope).toLowerCase() !== 'global' && html`
                                                <span class="badge bg-dark text-white">${formatExecutionScope(activeExecutionScope)}</span>
                                            `}
                                            ${activeLockExpired && html`<span class="badge bg-danger text-white">Expired</span>`}
                                        </div>
                                        <div class="small text-muted text-break">${currentCronStatus.lockedBy || 'Unknown worker'}</div>
                                        ${lockExpiresAt && html`<div class="small mt-2">Renews by ${lockExpiresAt.toLocaleString()}</div>`}
                                    ` : html`
                                        <span class="badge bg-success text-white">No active scheduled lease</span>
                                    `}
                                </div>
                            </div>
                            <div class="col-lg-8">
                                <div class="row g-2">
                                    ${laneSummaries.map((lane) => html`
                                        <div class="col-sm-6 col-xl-4">
                                            <div class=${`border rounded p-3 h-100 ${lane.active ? 'border-primary' : ''}`}>
                                                <div class="d-flex justify-content-between align-items-start gap-2">
                                                    <div class="fw-semibold">${lane.label}</div>
                                                    ${lane.active && html`<span class="badge bg-primary text-white">Running</span>`}
                                                </div>
                                                <div class="small text-muted mt-1">${lane.total} task${lane.total === 1 ? '' : 's'}</div>
                                                <div class="mt-2">
                                                    ${lane.overdue > 0
                                                        ? html`<span class="badge bg-danger text-white">${lane.overdue} overdue</span>`
                                                        : html`<span class="badge bg-success-lt text-success">On schedule</span>`}
                                                </div>
                                            </div>
                                        </div>
                                    `)}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `}

            <div class="mb-3">
                <h4>Activity Details & Filters</h4>
                <p class="text-muted small">Compact audit stream. Hover for full context; expand a row for diagnostics and raw metadata.</p>
            </div>

            ${highlightedEventId && html`
                <div class="card mb-3 border-primary">
                    <div class="card-header">
                        <h3 class="card-title mb-0">
                            <i class="ti ti-list-details me-2"></i>
                            Manual Job Detail
                        </h3>
                    </div>
                    <div class="card-body">
                        ${loadingSelectedAuditEvent ? html`
                            <div class="text-muted small">
                                <span class="spinner-border spinner-border-sm me-2"></span>
                                Loading selected audit event...
                            </div>
                        ` : selectedAuditEvent ? html`
                            ${(() => {
                                const meta = selectedAuditEvent.metadata || {};
                                const status = selectedAuditEvent.status || meta.status || 'Queued';
                                const taskId = selectedAuditEvent.targetType || meta.taskId || 'Unknown';
                                const scopeKey = selectedAuditEvent.targetId || meta.scopeKey || '-';
                                const durationSeconds = meta.durationSeconds;
                                const progressPercent = meta.progressPercent ?? meta.progress?.percent;
                                const statusClass = (() => {
                                    const n = String(status || '').toLowerCase();
                                    if (n === 'completed') return 'bg-success text-white';
                                    if (n === 'failed' || n === 'exception' || n === 'rejected') return 'bg-danger text-white';
                                    if (n === 'running') return 'bg-primary text-white';
                                    return 'bg-info text-white';
                                })();

                                return html`
                                    <div class="d-flex flex-wrap gap-2 mb-3">
                                        <span class="badge ${statusClass}">${status}</span>
                                        <span class="badge bg-secondary text-white">${taskId}</span>
                                        <span class="badge bg-dark text-white">${scopeKey}</span>
                                    </div>
                                    <div class="row g-3 small">
                                        <div class="col-md-6">
                                            <div class="text-muted">Audit Event ID</div>
                                            <div class="fw-semibold font-monospace">${selectedAuditEvent.eventId}</div>
                                        </div>
                                        <div class="col-md-6">
                                            <div class="text-muted">Requested By</div>
                                            <div class="fw-semibold">${selectedAuditEvent.performedBy || 'system'}</div>
                                        </div>
                                        ${selectedAuditEvent.timestamp && html`
                                            <div class="col-md-6">
                                                <div class="text-muted">Created At</div>
                                                <div class="fw-semibold">${new Date(selectedAuditEvent.timestamp).toLocaleString()}</div>
                                            </div>
                                        `}
                                        ${selectedAuditEvent.completedAt && html`
                                            <div class="col-md-6">
                                                <div class="text-muted">Completed At</div>
                                                <div class="fw-semibold">${new Date(selectedAuditEvent.completedAt).toLocaleString()}</div>
                                            </div>
                                        `}
                                        ${progressPercent != null && html`
                                            <div class="col-md-6">
                                                <div class="text-muted">Progress</div>
                                                <div class="fw-semibold">${progressPercent}%</div>
                                            </div>
                                        `}
                                        ${durationSeconds != null && html`
                                            <div class="col-md-6">
                                                <div class="text-muted">Duration</div>
                                                <div class="fw-semibold">${Number(durationSeconds).toFixed(2)}s</div>
                                            </div>
                                        `}
                                    </div>
                                    ${meta.error && html`
                                        <div class="alert alert-danger mt-3 mb-0">
                                            <strong>Error:</strong> ${meta.error}
                                        </div>
                                    `}
                                `;
                            })()}
                        ` : html`
                            <div class="text-muted small">Selected audit event was not found. It may be outside the loaded retention window.</div>
                        `}
                    </div>
                </div>
            `}

            <!-- Filters -->
            <div class="card mb-3">
                <div class="card-body">
                    <div class="row g-3">
                        <div class="col-md-3">
                            <label class="form-label">Event Type</label>
                            <select class="form-select" value=${filterJob} onChange=${(e) => setFilterJob(e.target.value)}>
                                <option value="all">All Events</option>
                                <option value="CronExecution">Cron Execution</option>
                                <option value="ReportSent">Report Sent</option>
                                <option value="ReportFailed">Report Failed</option>
                                <option value="BatchComplete">Batch Complete</option>
                            </select>
                        </div>
                        <div class="col-md-3">
                            <label class="form-label">Status</label>
                            <select class="form-select" value=${filterStatus} onChange=${(e) => setFilterStatus(e.target.value)}>
                                <option value="all">All Status</option>
                                <option value="success">Success</option>
                                <option value="running">Running</option>
                                <option value="queued">Queued</option>
                                <option value="failed">Failed</option>
                            </select>
                        </div>
                        <div class="col-md-3">
                            <label class="form-label">Organization</label>
                            <input 
                                type="text" 
                                class="form-control" 
                                placeholder="Filter by Org ID"
                                value=${filterOrg}
                                onInput=${(e) => setFilterOrg(e.target.value)}
                            />
                        </div>
                        <div class="col-md-3">
                            <label class="form-label">Time Range</label>
                            <select class="form-select" value=${rangeDays} onChange=${(e) => setRangeDays(parseInt(e.target.value, 10))}>
                                <option value="1">Last 24 hours</option>
                                <option value="3">Last 3 days</option>
                                <option value="7">Last 7 days</option>
                                <option value="15">Last 15 days</option>
                                <option value="30">Last 30 days</option>
                                <option value="90">Last 90 days</option>
                            </select>
                        </div>
                    </div>
                    <div class="mt-3 d-flex justify-content-between align-items-center">
                        <div class="text-muted small">
                            Showing ${filteredEvents.length} of ${events.length} events
                        </div>
                        <button class="btn btn-sm btn-primary" disabled=${loading} onClick=${() => loadCronEvents(true)}>
                            ${loading ? html`<span class="spinner-border spinner-border-sm me-2"></span>` : html`<i class="ti ti-refresh me-1"></i>`}
                            ${loading ? 'Loading...' : 'Refresh'}
                        </button>
                    </div>
                </div>
            </div>

            ${cronStatus?.currentStatus?.warnings?.length > 0 && html`
                <div class="alert alert-warning mb-3" role="alert">
                    <div class="fw-semibold mb-2">Operational Warnings</div>
                    ${cronStatus.currentStatus.warnings.map(warning => html`
                        <div class="small mb-1">${warning.message}</div>
                    `)}
                </div>
            `}

            <!-- Scheduled Tasks -->
            ${cronStatus && cronStatus.tasks && cronStatus.tasks.length > 0 && html`
                <div class="card mb-3">
                    <div class="card-header">
                        <h3 class="card-title">Scheduled Tasks</h3>
                        <div class="card-subtitle text-muted">Latest and next execution per task</div>
                    </div>
                    <div class="table-responsive">
                        <table class="table table-vcenter card-table cron-scheduled-tasks-table">
                            <thead>
                                <tr>
                                    <th>Task</th>
                                    <th>Frequency</th>
                                    <th>Schedule</th>
                                    <th>Executions</th>
                                    <th>Avg Duration</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${cronStatus.tasks.map(task => {
                                    const failureRate = task.totalExecutions > 0 ? (task.failedExecutions / task.totalExecutions * 100).toFixed(1) : 0;
                                    const liveState = getTaskLiveState(task);

                                    const execHistory = Array.isArray(task.executionHistory) ? task.executionHistory : [];
                                    const lastExec = execHistory
                                        .slice()
                                        .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))[0];

                                    const lastExecStatus = lastExec?.status || null;
                                    const lastExecDate = lastExec?.completedAt ? new Date(lastExec.completedAt) : null;
                                    const lastExecAt = lastExecDate && !Number.isNaN(lastExecDate.getTime()) ? lastExecDate.toLocaleString() : null;
                                    const nextScheduledDate = task.nextScheduledRun ? new Date(task.nextScheduledRun) : null;
                                    const nextScheduledAt = nextScheduledDate && !Number.isNaN(nextScheduledDate.getTime()) ? nextScheduledDate.toLocaleString() : null;
                                    const laneLabel = formatLaneLabel(task.laneId);
                                    const executionScopeLabel = task.executionScope && String(task.executionScope).toLowerCase() !== 'global'
                                        ? formatExecutionScope(task.executionScope)
                                        : null;
                                    const lastExecBadgeClass =
                                        lastExecStatus === 'Success'
                                            ? 'bg-success-lt text-success'
                                            : lastExecStatus === 'Failed'
                                                ? 'bg-danger-lt text-danger'
                                                : lastExecStatus
                                                    ? 'bg-warning-lt text-warning'
                                                    : 'bg-secondary-lt text-secondary';
                                    
                                    return html`
                                        <tr>
                                            <td>
                                                <div class="d-flex align-items-start gap-2 min-w-0">
                                                    <span class=${`cron-task-lane-icon ${getLaneToneClass(task.laneId)}`} title=${`Lane: ${laneLabel}`} aria-label=${`Lane: ${laneLabel}`}>
                                                        <i class=${`ti ${getLaneIconClass(task.laneId)}`}></i>
                                                    </span>
                                                    <div class="min-w-0">
                                                        <div class="fw-bold text-truncate cron-scheduled-task-title" title=${task.description || task.displayName || task.taskId}>${task.displayName || task.taskId}</div>
                                                        <div class="d-flex flex-wrap gap-1 mt-1">
                                                            ${(task.displayName && task.displayName !== task.taskId)
                                                                ? html`<span class="text-muted small text-truncate cron-scheduled-task-id" title=${task.taskId}>${task.taskId}</span>`
                                                                : ''}
                                                            ${executionScopeLabel && html`<span class="badge bg-dark text-white">${executionScopeLabel}</span>`}
                                                        </div>
                                                        ${task.description ? html`<div class="text-muted small mt-1 text-truncate cron-scheduled-task-description" title=${task.description}>${truncateMiddle(task.description, 56)}</div>` : ''}
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <span class="badge bg-blue-lt text-blue">${task.frequencyHours}h</span>
                                            </td>
                                            <td class="cron-task-schedule-cell">
                                                <div class="d-flex flex-column gap-1">
                                                    <div class="d-flex flex-wrap align-items-center gap-1" title=${lastExecAt || 'No previous execution'}>
                                                        <span class="text-muted small">Last</span>
                                                        <span class=${`badge ${lastExecBadgeClass}`}>
                                                            ${lastExecDate ? formatRelativeTime(lastExecDate) : 'Never'}
                                                            ${lastExecStatus ? ` · ${lastExecStatus}` : ''}
                                                        </span>
                                                        ${lastExec?.durationMs != null && html`<span class="text-muted small">${(lastExec.durationMs / 1000).toFixed(2)}s</span>`}
                                                    </div>
                                                    <div class="d-flex flex-wrap align-items-center gap-1" title=${nextScheduledAt || 'No next schedule available'}>
                                                        <span class="text-muted small">Next</span>
                                                        ${nextScheduledDate
                                                            ? html`<span class="badge bg-secondary-lt text-secondary">${formatRelativeTime(nextScheduledDate)}</span>`
                                                            : html`<span class="text-muted small">-</span>`}
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <div>
                                                    <span class="badge bg-info-lt text-info">${task.totalExecutions} total</span>
                                                    ${task.failedExecutions > 0 ? html`<span class="badge bg-danger ms-1">${task.failedExecutions} failed</span>` : ''}
                                                </div>
                                                ${task.totalExecutions > 0 && html`<small class="text-muted">${failureRate}% failure rate</small>`}
                                            </td>
                                            <td>
                                                ${task.averageDurationMs > 0 
                                                    ? html`<span class="text-muted">${(task.averageDurationMs / 1000).toFixed(2)}s</span>`
                                                    : html`<span class="text-muted">-</span>`}
                                            </td>
                                            <td>
                                                <span class="badge ${liveState.badgeClass}">
                                                    <i class="ti ${liveState.icon} me-1"></i>
                                                    ${liveState.label}
                                                </span>
                                                ${liveState.progressPercent != null && html`
                                                    <div class="text-muted small mt-1">${liveState.progressPercent}% complete</div>
                                                `}
                                                ${liveState.ageMinutes != null && html`
                                                    <div class="text-muted small">last update ${Math.floor(liveState.ageMinutes)}m ago</div>
                                                `}
                                            </td>
                                        </tr>
                                    `;
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            `}

            ${filteredEvents.length === 0 && !loading ? html`
                <div class="empty">
                    <div class="empty-icon"><i class="ti ti-filter-off"></i></div>
                    <p class="empty-title">No matching cron activity</p>
                    <p class="empty-subtitle text-muted">
                        ${events.length === 0 ? 'Try expanding the date range or refresh.' : 'Try adjusting your filters.'}
                    </p>
                </div>
            ` : html`
                <div class="table-responsive">
                    <table class="table table-sm table-hover">
                        <thead>
                            <tr>
                                <th>Activity</th>
                                <th>Scope</th>
                                <th>When</th>
                                <th>Signals</th>
                                <th>Context</th>
                                <th style="width: 40px;"></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filteredEvents.map(renderEventRow)}
                        </tbody>
                    </table>
                </div>

                <!-- Infinite Scroll Sentinel -->
                <div ref=${scrollObserverRef} style="height: 20px; margin: 20px 0;"></div>
                
                ${loadingMore ? html`
                    <div class="text-center py-3">
                        <div class="spinner-border spinner-border-sm text-primary" role="status">
                            <span class="visually-hidden">Loading more...</span>
                        </div>
                        <div class="text-muted mt-2 small">Loading more events...</div>
                    </div>
                ` : ''}
                
                ${!hasMore && events.length > 0 ? html`
                    <div class="text-center text-muted py-2">
                        <small>No more events to load</small>
                    </div>
                ` : ''}
            `}
        </div>

        ${renderTraceModal()}
        ${renderCronChurnHelpModal()}
        ${renderCronChurnTaskModal()}
    `;
}
