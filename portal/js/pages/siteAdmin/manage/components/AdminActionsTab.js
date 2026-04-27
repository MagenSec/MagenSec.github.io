/**
 * AdminActionsTab - Administrative actions UI with grouped cron catalog.
 */

const { html } = window;
const { useState, useEffect, useRef } = window.preactHooks;

const GROUP_ICONS = {
    'org-data': 'ti-database',
    'business': 'ti-chart-bar',
    'operations': 'ti-settings-2',
    'intel': 'ti-shield-search',
    'maintenance': 'ti-tool',
    'custom': 'ti-flask-2'
};

const isTerminalAuditStatus = (status) => ['completed', 'failed', 'exception', 'rejected', 'cancelled', 'timedout'].includes(String(status || '').toLowerCase());

const toDisplayStatus = (status) => {
    const normalized = String(status || '').toLowerCase();
    if (normalized === 'queued') return 'Queued';
    if (normalized === 'running') return 'Running';
    if (normalized === 'completed') return 'Completed';
    if (normalized === 'failed') return 'Failed';
    if (normalized === 'exception') return 'Exception';
    if (normalized === 'rejected') return 'Rejected';
    return status || 'Pending';
};

const defaultParamsForJob = (job) => ({
    mode: job?.defaultMode || '',
    orgId: '',
    startDate: '',
    endDate: '',
    retentionDays: '',
    rebuildAll: false
});

export function AdminActionsTab({ orgs = [], onTriggerCron, onResetRemediation, setMainSection, setActiveTab, loadCronStatus }) {
    const [catalogGroups, setCatalogGroups] = useState([]);
    const [loadingCatalog, setLoadingCatalog] = useState(true);
    const [tasksError, setTasksError] = useState(null);
    const [taskConflictMap, setTaskConflictMap] = useState({});
    const [taskStatusMap, setTaskStatusMap] = useState({});
    const [selectedJobByGroup, setSelectedJobByGroup] = useState({});
    const [paramsByGroup, setParamsByGroup] = useState({});
    const [resultByGroup, setResultByGroup] = useState({});
    const [triggeringByGroup, setTriggeringByGroup] = useState({});
    const [historyOpenByGroup, setHistoryOpenByGroup] = useState({});
    const [historyRangeByGroup, setHistoryRangeByGroup] = useState({});
    const [historyTrendByGroup, setHistoryTrendByGroup] = useState({});
    const [historyLoadingByGroup, setHistoryLoadingByGroup] = useState({});
    const pollTimersRef = useRef({});

    const [resetOrgId, setResetOrgId] = useState('');
    const [resettingRemediation, setResettingRemediation] = useState(false);
    const [resetResult, setResetResult] = useState(null);
    const [showResetRemediation, setShowResetRemediation] = useState(false);
    const [expandedGroups, setExpandedGroups] = useState({});

    const toggleGroup = (groupId) => setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));

    useEffect(() => {
        loadCatalog();
        loadTaskConflicts();
    }, []);

    useEffect(() => {
        return () => {
            Object.values(pollTimersRef.current || {}).forEach((timerId) => {
                if (timerId) {
                    window.clearTimeout(timerId);
                }
            });
            pollTimersRef.current = {};
        };
    }, []);

    const clearPollTimer = (groupId) => {
        if (pollTimersRef.current[groupId]) {
            window.clearTimeout(pollTimersRef.current[groupId]);
            delete pollTimersRef.current[groupId];
        }
    };

    const getTaskConflictInfo = (taskId) => taskConflictMap?.[taskId] || {
        activeManualRunCount: 0,
        hasAllScopeManualRun: false
    };

    const getCronActivityDetailHref = (resultData) => {
        if (!resultData?.auditEventId) {
            return '#!/siteadmin/activity?tab=cron-jobs';
        }

        const query = new URLSearchParams();
        query.set('tab', 'cron-jobs');
        query.set('eventId', resultData.auditEventId);
        if (resultData.auditPartitionKey) query.set('date', resultData.auditPartitionKey);
        if (resultData.auditRowKey) query.set('eventKey', resultData.auditRowKey);
        return `#!/siteadmin/activity?${query.toString()}`;
    };

    const navigateToCronActivity = (options = {}) => {
        const query = new URLSearchParams();
        query.set('tab', 'cron-jobs');
        if (options.eventId) query.set('eventId', options.eventId);
        if (options.date) query.set('date', options.date);
        if (options.eventKey) query.set('eventKey', options.eventKey);
        window.location.hash = `#!/siteadmin/activity?${query.toString()}`;
    };

    const loadTaskConflicts = async () => {
        try {
            const response = await window.api.adminGetCronStatus();
            if (!response?.success || !response?.data?.tasks) {
                return;
            }

            const nextConflicts = {};
            const nextStatuses = {};
            for (const task of response.data.tasks) {
                if (!task?.taskId) continue;
                nextConflicts[task.taskId] = {
                    activeManualRunCount: Number(task.activeManualRunCount || 0),
                    hasAllScopeManualRun: Boolean(task.hasAllScopeManualRun)
                };
                nextStatuses[task.taskId] = task;
            }

            setTaskConflictMap(nextConflicts);
            setTaskStatusMap(nextStatuses);
        } catch (error) {
            console.error('[AdminActionsTab] Failed to load task conflicts:', error);
        }
    };

    const formatCadenceLabel = (task) => {
        if (!task) return 'Planned';
        if (task.isOnDemand) return 'On-Demand';
        const freq = Number(task.frequencyHours || 0);
        if (freq <= 0) return 'Manual';
        if (freq === 1) return 'Every 1h';
        return `Every ${freq}h`;
    };

    const buildFallbackCatalogFromTasks = (tasks) => {
        const taskMap = new Map((Array.isArray(tasks) ? tasks : []).map((task) => [task.taskId, task]));
        const mkJob = ({
            groupId,
            jobId,
            title,
            description,
            taskId,
            supportsOrg = false,
            supportsRange = false,
            supportsMode = false,
            supportsRetention = false,
            modes = [],
            defaultMode = '',
            availabilityNote = null
        }) => {
            const task = taskId ? taskMap.get(taskId) : null;
            const isAvailable = Boolean(task);
            return {
                groupId,
                jobId,
                title,
                description: task?.description || description,
                taskId: task?.taskId || taskId,
                displayName: task?.displayName || title,
                isAvailable,
                availability: isAvailable ? 'ready' : 'planned',
                availabilityNote: isAvailable ? null : availabilityNote,
                supportsOrg,
                supportsRange,
                supportsMode,
                supportsRetention,
                modes,
                defaultMode,
                cadenceLabel: formatCadenceLabel(task),
                scopeLabel: supportsOrg ? 'Per org' : 'Platform'
            };
        };

        return [
            {
                groupId: 'org-data',
                title: 'Org Data',
                description: 'Daily per-org core telemetry pipeline for security, compliance, audit, trends, and inventory.',
                jobs: [
                    mkJob({
                        groupId: 'org-data',
                        jobId: 'org-data',
                        title: 'Org Data',
                        description: 'Generate security, compliance, audit, trends, and inventory together for the selected org/date scope.',
                        taskId: 'Org Data Cook',
                        supportsOrg: true,
                        supportsRange: true,
                        supportsMode: true,
                        modes: [
                            { value: 'Normal', label: 'Smart', description: 'Use task-native cadence logic for the selected scope.' },
                            { value: 'BuildMissing', label: 'Build Missing', description: 'Generate missing artifacts for the selected scope.' },
                            { value: 'BuildAll', label: 'Build All', description: 'Regenerate all artifacts for the selected scope.' },
                            { value: 'ClearAll', label: 'Clear', description: 'Delete generated artifacts for the selected scope without rebuilding.' },
                            { value: 'ClearAndBuildAll', label: 'Clear And Build', description: 'Delete and fully rebuild the selected scope.' }
                        ],
                        defaultMode: 'Normal'
                    })
                ]
            },
            {
                groupId: 'business',
                title: 'Business',
                description: 'Downstream and platform-level derived artifacts: AI snapshots, report generation, and business/platform aggregates.',
                jobs: [
                    mkJob({
                        groupId: 'business',
                        jobId: 'ai-snapshots',
                        title: 'AI Snapshots',
                        description: 'Generate/repair AI snapshots using Org Data pipeline controls.',
                        taskId: 'Org Data Cook',
                        supportsOrg: true,
                        supportsRange: true,
                        supportsMode: true,
                        modes: [
                            { value: 'BuildMissing', label: 'Build Missing', description: 'Generate only missing AI snapshot artifacts for the selected scope.' },
                            { value: 'BuildAll', label: 'Build All', description: 'Regenerate AI snapshot artifacts for the selected scope.' },
                            { value: 'ClearAndBuildAll', label: 'Clear And Build', description: 'Clear generated artifacts, then rebuild AI snapshots for the selected scope.' }
                        ],
                        defaultMode: 'BuildMissing'
                    }),
                    mkJob({
                        groupId: 'business',
                        jobId: 'reports',
                        title: 'Reports',
                        description: 'Backfill missing generated report artifacts across the historical horizon.',
                        taskId: 'Report Backfill',
                        supportsOrg: false,
                        supportsRange: false
                    }),
                    mkJob({
                        groupId: 'business',
                        jobId: 'business-data',
                        title: 'Business Data',
                        description: 'Platform-wide business snapshots and trend aggregation.',
                        taskId: 'Business Metrics Snapshots',
                        supportsRange: true,
                        supportsMode: true,
                        modes: [
                            { value: 'Normal', label: 'Smart', description: 'Use task-native cadence logic for the selected range.' },
                            { value: 'BuildMissing', label: 'Build Missing', description: 'Generate only missing business snapshots.' },
                            { value: 'BuildAll', label: 'Build All', description: 'Regenerate all business snapshots for the selected range.' }
                        ],
                        defaultMode: 'Normal'
                    })
                ]
            },
            {
                groupId: 'operations',
                title: 'Operations',
                description: 'Billing and communications execution jobs. Communications remains send-only.',
                jobs: [
                    mkJob({ groupId: 'operations', jobId: 'license', title: 'License', description: 'Credit consumption and billing reconciliation across active orgs.', taskId: 'Credit Consumption', supportsOrg: true }),
                    mkJob({ groupId: 'operations', jobId: 'comms', title: 'Comms', description: 'Send-only communications dispatch for already-generated report artifacts.', taskId: 'Report Dispatch', supportsOrg: true })
                ]
            },
            {
                groupId: 'intel',
                title: 'Intel',
                description: 'Independent cadence jobs for enrichment, vulnerability feeds, and signal assimilation.',
                jobs: [
                    mkJob({ groupId: 'intel', jobId: 'signal-assimilation', title: 'Signal Assimilation', description: 'Compute latest compliance and AV signals into per-device compliance state and open alerts.', taskId: 'Signal Assimilation', supportsOrg: true }),
                    mkJob({ groupId: 'intel', jobId: 'cve-feed-sync', title: 'CVE Feed Sync', description: 'Sync NVD CVE feeds and refresh enriched CVE intelligence snapshots.', taskId: 'CVE Sync' }),
                    mkJob({ groupId: 'intel', jobId: 'cpe-dictionary-sync', title: 'CPE Dictionary Sync', description: 'Sync NVD/TIIUAE/Microsoft CPE dictionaries and vendor-product mappings.', taskId: 'CPE Sync' }),
                    mkJob({ groupId: 'intel', jobId: 'threat-intel', title: 'Threat Intel', description: 'Refresh exploitability and KEV/EPSS intelligence feeds.', taskId: 'ThreatIntel Enrichment' }),
                    mkJob({ groupId: 'intel', jobId: 'vulnerability-match', title: 'Vulnerability Match', description: 'Cache-only CVE-to-app matching: emits/closes VULN alerts from fresh AppVersionIntel verdicts; on cache miss writes a PENDING stub and skips emission (AppVersionIntel Enricher resolves it next cycle). No inline MSRC/CPE/NVD calls.', taskId: 'Vuln Detection' }),
                    mkJob({ groupId: 'intel', jobId: 'appversion-intel-enricher', title: 'AppVersionIntel Enricher', description: 'Proactive sweeper: walks AppVersionIntel rows in PENDING/UNKNOWN/UNCONFIRMED/stale state and re-runs them through the MSRC + CPE + NVD pipeline. Sole upstream intel consumer; never enumerates inventory or emits alerts.', taskId: 'AppVersionIntel Enricher' }),
                    mkJob({ groupId: 'intel', jobId: 'msrc-patch-sync', title: 'MSRC Patch Sync', description: 'Download MSRC CVRF documents (parallel fetch) and rebuild the patch posture index blob used to detect missing security KBs per device.', taskId: 'MSRC Patch Sync' })
                ]
            },
            {
                groupId: 'maintenance',
                title: 'Maintenance',
                description: 'Lifecycle, cleanup, and data aggregation tasks.',
                jobs: [
                    mkJob({ groupId: 'maintenance', jobId: 'retention-cleanup', title: 'Retention Cleanup', description: 'Daily unified cleanup: signal prune (30d), changelog prune (90d), blob lifecycle (450d blobs, 90d snapshots), command artifacts, and ApiLogs prune (30d).', taskId: 'Retention Cleanup' }),
                    mkJob({ groupId: 'maintenance', jobId: 'telemetry-cleanup', title: 'Telemetry Cleanup', description: 'On-demand retention purge for raw Heartbeat telemetry.', taskId: 'Telemetry Cleanup', supportsOrg: true, supportsRange: true, supportsRetention: true }),
                    mkJob({ groupId: 'maintenance', jobId: 'perf-aggregation', title: 'Perf Aggregation', description: 'Per-org performance aggregation into hourly buckets. Prunes raw data >7d, aggregation retained 180d.', taskId: 'Perf Aggregation', supportsOrg: true, supportsRange: true }),
                    mkJob({ groupId: 'maintenance', jobId: 'cache-reset', title: 'Cache Reset', description: 'Purge daily cost cache, business metric blobs, and rebuild org cache entries.', taskId: 'Cache Reset' }),
                    mkJob({ groupId: 'maintenance', jobId: 'inventory-reset', title: 'Inventory Reset', description: 'Force full inventory re-derive from Signals. Deletes markers and inv|/comp|/mach| rows, then triggers SignalAssimilation.', taskId: 'Inventory Reset', supportsOrg: true }),
                    mkJob({ groupId: 'maintenance', jobId: 'alert-purge', title: 'Alert Purge', description: 'Purge all VULN- alert rows from per-org Alerts tables, then trigger VulnDetection to rebuild clean alerts.', taskId: 'Alert Purge', supportsOrg: true }),
                    mkJob({ groupId: 'maintenance', jobId: 'data-restore', title: 'Data Restore', description: 'Daily restore/recovery runner. Scheduled mode restores yesterday; manual trigger rebuilds full range for registered restore scenarios.', taskId: 'Data Restore' })
                ]
            },
            {
                groupId: 'custom',
                title: 'Custom',
                description: 'Operator-only jobs reserved for migrations and specialized workflows.',
                jobs: [
                    mkJob({ groupId: 'custom', jobId: 'org-storage-migration', title: 'Org Storage Migration', description: 'Cross-account storage migration. Copies all per-org tables and blob snapshots between storage accounts with resumable checkpoints.', taskId: 'Org Storage Migration', supportsOrg: true })
                ]
            }
        ];
    };

    const applyCatalogGroups = (groups) => {
        setCatalogGroups(groups);

        const nextSelected = {};
        const nextParams = {};
        for (const group of groups) {
            const initialJob = group.jobs.find((job) => job.isAvailable) || group.jobs[0];
            if (!initialJob) continue;
            nextSelected[group.groupId] = initialJob.jobId;
            nextParams[group.groupId] = defaultParamsForJob(initialJob);
        }

        setSelectedJobByGroup(nextSelected);
        setParamsByGroup(nextParams);

        const nextRanges = {};
        for (const group of groups) {
            nextRanges[group.groupId] = 7;
        }
        setHistoryRangeByGroup(nextRanges);
    };

    const buildTrendSeries = (items, rangeDays) => {
        const safeDays = Math.max(1, Number(rangeDays || 7));
        const buckets = new Map();
        const now = new Date();

        for (let i = safeDays - 1; i >= 0; i--) {
            const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
            const key = day.toISOString().slice(0, 10);
            buckets.set(key, {
                dayKey: key,
                shortLabel: day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                success: 0,
                failed: 0,
                manual: 0,
                scheduled: 0
            });
        }

        for (const evt of items || []) {
            const ts = evt?.timestamp ? new Date(evt.timestamp) : null;
            if (!ts || Number.isNaN(ts.getTime())) continue;
            const dayKey = new Date(Date.UTC(ts.getUTCFullYear(), ts.getUTCMonth(), ts.getUTCDate())).toISOString().slice(0, 10);
            const slot = buckets.get(dayKey);
            if (!slot) continue;

            const status = String(evt?.metadata?.status || evt?.metadata?.Status || evt?.status || '').toLowerCase();
            const isSuccess = !status || status === 'completed' || status === 'success';
            if (isSuccess) slot.success += 1;
            else slot.failed += 1;

            const subType = String(evt?.subType || '').toLowerCase();
            const isManual = subType.includes('manual');
            if (isManual) slot.manual += 1;
            else slot.scheduled += 1;
        }

        return Array.from(buckets.values());
    };

    const loadHistoryTrend = async (groupId, job, rangeDays) => {
        if (!job?.taskId) {
            setHistoryTrendByGroup((prev) => ({ ...prev, [groupId]: { points: [], totals: null } }));
            return;
        }

        setHistoryLoadingByGroup((prev) => ({ ...prev, [groupId]: true }));
        try {
            const query = new URLSearchParams({
                cronActivity: 'true',
                pageSize: '300',
                days: String(rangeDays || 7)
            });

            const response = await window.api.get(`/api/v1/admin/audit?${query.toString()}`);
            const allEvents = response?.success && Array.isArray(response?.data?.events)
                ? response.data.events
                : [];

            const taskEvents = allEvents.filter((evt) => {
                if (String(evt?.eventType || '').toUpperCase() !== 'CRONRUN') return false;
                const taskId = evt?.metadata?.taskId || evt?.metadata?.TaskId || evt?.targetType || '';
                return String(taskId).toLowerCase() === String(job.taskId).toLowerCase();
            });

            const points = buildTrendSeries(taskEvents, rangeDays);
            const totals = points.reduce((acc, item) => {
                acc.success += item.success;
                acc.failed += item.failed;
                acc.manual += item.manual;
                acc.scheduled += item.scheduled;
                return acc;
            }, { success: 0, failed: 0, manual: 0, scheduled: 0 });

            setHistoryTrendByGroup((prev) => ({ ...prev, [groupId]: { points, totals } }));
        } catch (error) {
            console.error('[AdminActionsTab] Failed to load history trend:', error);
            setHistoryTrendByGroup((prev) => ({ ...prev, [groupId]: { points: [], totals: null } }));
        } finally {
            setHistoryLoadingByGroup((prev) => ({ ...prev, [groupId]: false }));
        }
    };

    const loadCatalog = async () => {
        try {
            setLoadingCatalog(true);
            setTasksError(null);
            const response = await window.api.adminGetCronCatalog();

            if (response?.success && Array.isArray(response?.data?.groups)) {
                applyCatalogGroups(response.data.groups);
            } else {
                throw new Error(response?.message || 'Failed to load cron catalog');
            }
        } catch (error) {
            console.error('[AdminActionsTab] Failed to load cron catalog:', error);
            try {
                const fallback = await window.api.adminGetAvailableCronTasks();
                if (fallback?.success && Array.isArray(fallback?.data)) {
                    const fallbackGroups = buildFallbackCatalogFromTasks(fallback.data);
                    applyCatalogGroups(fallbackGroups);
                    setTasksError(null);
                } else {
                    setTasksError(error.message || 'Failed to load cron catalog');
                }
            } catch (fallbackError) {
                console.error('[AdminActionsTab] Failed fallback to available tasks:', fallbackError);
                setTasksError(error.message || fallbackError.message || 'Failed to load cron catalog');
            }
        } finally {
            setLoadingCatalog(false);
        }
    };

    const getSelectedJob = (group) => {
        const selectedJobId = selectedJobByGroup[group.groupId];
        return group.jobs.find((job) => job.jobId === selectedJobId) || group.jobs[0] || null;
    };

    const updateGroupParams = (groupId, patch) => {
        setParamsByGroup((prev) => ({
            ...prev,
            [groupId]: {
                ...(prev[groupId] || {}),
                ...patch
            }
        }));
    };

    const handleSelectJob = (group, jobId) => {
        const nextJob = group.jobs.find((job) => job.jobId === jobId);
        setSelectedJobByGroup((prev) => ({ ...prev, [group.groupId]: jobId }));
        if (nextJob) {
            updateGroupParams(group.groupId, defaultParamsForJob(nextJob));
        }
    };

    const startPolling = (groupId, initialData, jobTitle) => {
        const auditEventId = initialData?.auditEventId;
        if (!auditEventId) return;

        const date = initialData.auditPartitionKey;
        const eventKey = initialData.auditRowKey;
        const intervalMs = (initialData.pollIntervalSeconds || 5) * 1000;

        const poll = async () => {
            try {
                const response = await window.api.adminGetAuditEvent(auditEventId, { date, eventKey });
                if (!response?.success || !response?.data) {
                    pollTimersRef.current[groupId] = window.setTimeout(poll, intervalMs);
                    return;
                }

                const metadata = response.data.metadata || {};
                const nextStatus = response.data.status || metadata.status || initialData.status || 'Queued';
                const nextData = {
                    ...initialData,
                    status: nextStatus,
                    description: response.data.description,
                    completedAt: response.data.completedAt,
                    timestamp: response.data.timestamp,
                    metadata,
                    progress: metadata.progress || null,
                    progressPercent: metadata.progressPercent ?? metadata.progress?.percent ?? null,
                    itemsProcessed: metadata.itemsProcessed,
                    durationSeconds: metadata.durationSeconds,
                    error: metadata.error || null,
                    notes: metadata.notes || null
                };

                setResultByGroup((prev) => ({
                    ...prev,
                    [groupId]: {
                        success: !['failed', 'exception', 'rejected'].includes(String(nextStatus || '').toLowerCase()),
                        jobTitle,
                        data: nextData,
                        error: nextData.error || prev?.[groupId]?.error || null
                    }
                }));

                if (isTerminalAuditStatus(nextStatus)) {
                    clearPollTimer(groupId);
                    loadCronStatus?.();
                    loadTaskConflicts();
                    return;
                }

                pollTimersRef.current[groupId] = window.setTimeout(poll, intervalMs);
            } catch (error) {
                console.error('[AdminActionsTab] Failed to poll audit event:', error);
                pollTimersRef.current[groupId] = window.setTimeout(poll, intervalMs);
            }
        };

        clearPollTimer(groupId);
        pollTimersRef.current[groupId] = window.setTimeout(poll, intervalMs);
    };

    const handleTriggerCron = async (group, job) => {
        if (!job?.taskId || !job?.isAvailable) return;

        const params = paramsByGroup[group.groupId] || {};
        const modeLabel = job.jobId === 'perf-aggregation'
            ? (params.rebuildAll ? ' [Rebuild Retained Window]' : ' [Continuous Pass]')
            : (job.supportsMode && params.mode ? ` [${params.mode}]` : '');
        const scopeLabel = job.supportsOrg && params.orgId ? ` / ${params.orgId}` : '';
        const confirmed = window.confirm(
            `Queue ${job.title}${modeLabel}${scopeLabel} now?\n\nThe request will be persisted first, then executed asynchronously when the container is available.`
        );
        if (!confirmed) return;

        setTriggeringByGroup((prev) => ({ ...prev, [group.groupId]: true }));
        setResultByGroup((prev) => ({ ...prev, [group.groupId]: null }));

        try {
            const effectiveMode = job.jobId === 'perf-aggregation'
                ? (params.rebuildAll ? 'BuildAll' : 'Normal')
                : (job.supportsMode ? (params.mode || undefined) : undefined);
            const includeRange = job.supportsRange && (job.jobId !== 'perf-aggregation' || params.rebuildAll);

            const request = {
                groupId: group.groupId,
                jobId: job.jobId,
                taskId: job.taskId,
                mode: effectiveMode,
                orgId: job.supportsOrg ? (params.orgId || undefined) : undefined,
                startDate: includeRange ? (params.startDate || undefined) : undefined,
                endDate: includeRange ? (params.endDate || undefined) : undefined,
                retentionDays: job.supportsRetention
                    ? (params.retentionDays ? Number(params.retentionDays) : undefined)
                    : undefined,
                forceClearStale: Boolean(params.forceClearStale)
            };

            const result = typeof onTriggerCron === 'function'
                ? await onTriggerCron(request)
                : await window.api.adminTriggerCron(request);

            if (result.success) {
                setResultByGroup((prev) => ({
                    ...prev,
                    [group.groupId]: {
                        success: true,
                        jobTitle: job.title,
                        data: result.data,
                        error: null
                    }
                }));
                startPolling(group.groupId, result.data, job.title);
            } else {
                setResultByGroup((prev) => ({
                    ...prev,
                    [group.groupId]: {
                        success: false,
                        jobTitle: job.title,
                        data: null,
                        error: result.message
                    }
                }));
            }
        } catch (error) {
            setResultByGroup((prev) => ({
                ...prev,
                [group.groupId]: {
                    success: false,
                    jobTitle: job.title,
                    data: null,
                    error: error.message
                }
            }));
        } finally {
            setTriggeringByGroup((prev) => ({ ...prev, [group.groupId]: false }));
        }
    };

    const handleResetRemediation = async () => {
        if (!resetOrgId) return;

        const confirmed = window.confirm(
            `Reset remediation status for org "${resetOrgId}"?\n\nThis is a privileged write operation intended for diagnostics/testing.`
        );
        if (!confirmed) return;

        setResettingRemediation(true);
        setResetResult(null);
        try {
            const result = await onResetRemediation(resetOrgId);
            if (result.success) {
                setResetResult({ success: true, data: result.data });
            } else {
                setResetResult({ success: false, error: result.message });
            }
        } catch (error) {
            setResetResult({ success: false, error: error.message });
        } finally {
            setResettingRemediation(false);
        }
    };

    const renderProgressBar = (result) => {
        const percent = Number(result?.data?.progressPercent ?? 0);
        if (!result?.data || Number.isNaN(percent)) {
            return null;
        }

        return html`
            <div class="mt-3">
                <div class="d-flex justify-content-between small text-muted mb-1">
                    <span>${result.data.progress?.stage || 'Progress'}</span>
                    <span>${percent}%</span>
                </div>
                <div class="progress progress-sm">
                    <div class="progress-bar bg-primary" role="progressbar" style=${`width: ${Math.max(0, Math.min(percent, 100))}%`}></div>
                </div>
            </div>
        `;
    };

    const renderResult = (groupId) => {
        const result = resultByGroup[groupId];
        if (!result) return null;

        return html`
            <div class="card mt-3 border ${result.success ? 'border-info' : 'border-danger'}">
                <div class="card-body">
                    <div class="d-flex align-items-start">
                        <div class="flex-grow-1">
                            <div class="fw-bold">${result.jobTitle}</div>
                            <div class="text-muted small">${result?.data?.status ? toDisplayStatus(result.data.status) : 'Failed to queue'}</div>
                            ${result?.data?.description && html`<div class="small mt-1">${result.data.description}</div>`}
                        </div>
                        <button type="button" class="btn-close" onClick=${() => setResultByGroup((prev) => ({ ...prev, [groupId]: null }))}></button>
                    </div>
                    ${renderProgressBar(result)}
                    ${result?.data && html`
                        <div class="row g-2 mt-1 small">
                            ${result.data.itemsProcessed !== undefined && result.data.itemsProcessed !== null && html`
                                <div class="col-6">
                                    <div class="text-muted">Items</div>
                                    <div class="fw-semibold">${result.data.itemsProcessed}</div>
                                </div>
                            `}
                            ${result.data.durationSeconds !== undefined && result.data.durationSeconds !== null && html`
                                <div class="col-6">
                                    <div class="text-muted">Duration</div>
                                    <div class="fw-semibold">${Number(result.data.durationSeconds).toFixed(2)}s</div>
                                </div>
                            `}
                        </div>
                    `}
                    ${result?.data?.auditEventId && html`
                        <div class="mt-3">
                            <a class="btn btn-sm btn-outline-primary" href=${getCronActivityDetailHref(result.data)}>
                                <i class="ti ti-list-details me-1"></i>
                                Open Activity Detail
                            </a>
                        </div>
                    `}
                    ${result?.error && html`
                        <div class="alert alert-danger mt-3 mb-0" style="word-break: break-word;">
                            <code>${result.error}</code>
                        </div>
                    `}
                </div>
            </div>
        `;
    };

    const renderHistory = (group, job) => {
        const isOpen = Boolean(historyOpenByGroup[group.groupId]);
        const taskStatus = job?.taskId ? taskStatusMap[job.taskId] : null;
        const selectedRange = Number(historyRangeByGroup[group.groupId] || 7);
        const trend = historyTrendByGroup[group.groupId] || { points: [], totals: null };
        const trendPoints = Array.isArray(trend.points) ? trend.points : [];
        const loadingTrend = Boolean(historyLoadingByGroup[group.groupId]);
        const maxTotal = Math.max(1, ...trendPoints.map((p) => p.success + p.failed));

        return html`
            <div class="mt-3 pt-3 border-top">
                <button class="btn btn-sm btn-link px-0" onClick=${() => {
                    const nextOpen = !isOpen;
                    setHistoryOpenByGroup((prev) => ({ ...prev, [group.groupId]: nextOpen }));
                    if (nextOpen) {
                        loadHistoryTrend(group.groupId, job, selectedRange);
                    }
                }}>
                    <i class="ti ${isOpen ? 'ti-chevron-up' : 'ti-chevron-down'} me-1"></i>
                    History
                </button>
                ${isOpen && html`
                    <div class="small text-muted mt-2">
                        ${taskStatus ? html`
                            <div><strong>Last run:</strong> ${taskStatus.lastRunAt ? new Date(taskStatus.lastRunAt).toLocaleString() : 'Never recorded'}</div>
                            <div><strong>Next scheduled:</strong> ${taskStatus.nextScheduledRun ? new Date(taskStatus.nextScheduledRun).toLocaleString() : 'On-Demand / n/a'}</div>
                            <div><strong>Failed executions:</strong> ${taskStatus.failedExecutions || 0}</div>
                        ` : html`<div>No status snapshot available for this job yet.</div>`}
                        <div class="mt-3 cron-history-panel">
                            <div class="d-flex align-items-center justify-content-between mb-2">
                                <div class="fw-semibold text-body">Run Trend</div>
                                <select
                                    class="form-select form-select-sm"
                                    style="max-width: 120px;"
                                    value=${selectedRange}
                                    onChange=${(e) => {
                                        const range = Number(e.target.value || 7);
                                        setHistoryRangeByGroup((prev) => ({ ...prev, [group.groupId]: range }));
                                        loadHistoryTrend(group.groupId, job, range);
                                    }}>
                                    <option value="7">7 days</option>
                                    <option value="15">15 days</option>
                                    <option value="30">30 days</option>
                                </select>
                            </div>

                            ${loadingTrend && html`
                                <div class="text-muted small mb-2">
                                    <span class="spinner-border spinner-border-sm me-2"></span>
                                    Loading trend...
                                </div>
                            `}

                            ${trend.totals && html`
                                <div class="d-flex flex-wrap gap-2 mb-2">
                                    <span class="badge bg-success text-white">${trend.totals.success} success</span>
                                    <span class="badge bg-danger text-white">${trend.totals.failed} failed</span>
                                    <span class="badge bg-primary text-white">${trend.totals.manual} manual</span>
                                    <span class="badge bg-secondary text-white">${trend.totals.scheduled} scheduled</span>
                                </div>
                            `}

                            <div class="cron-trend-chart" role="img" aria-label="Cron run trend chart">
                                ${trendPoints.map((point) => {
                                    const successHeight = Math.max(2, Math.round((point.success / maxTotal) * 48));
                                    const failedHeight = Math.max(point.failed > 0 ? 2 : 0, Math.round((point.failed / maxTotal) * 48));
                                    const totalHeight = Math.min(56, successHeight + failedHeight);
                                    return html`
                                        <div class="cron-trend-day" title=${`${point.shortLabel}: ${point.success} success, ${point.failed} failed, ${point.manual} manual, ${point.scheduled} scheduled`}>
                                            <div class="cron-trend-bar" style=${`height:${Math.max(2, totalHeight)}px`}>
                                                ${point.failed > 0 && html`<div class="cron-trend-segment cron-trend-failed" style=${`height:${failedHeight}px`}></div>`}
                                                ${point.success > 0 && html`<div class="cron-trend-segment cron-trend-success" style=${`height:${successHeight}px`}></div>`}
                                            </div>
                                            <div class="cron-trend-label">${point.shortLabel}</div>
                                        </div>
                                    `;
                                })}
                            </div>
                            <div class="small text-muted mt-2">Green = success, red = failed. Manual/scheduled totals are shown above.</div>
                        </div>

                        <div class="mt-2">
                            <a href="#" onClick=${(e) => { e.preventDefault(); navigateToCronActivity(); loadCronStatus?.(); }} class="btn btn-link btn-sm px-0">
                                <i class="ti ti-history me-1"></i>
                                Open full execution history
                            </a>
                        </div>
                    </div>
                `}
            </div>
        `;
    };

    const renderGroupCard = (group) => {
        const job = getSelectedJob(group);
        if (!job) return null;

        const params = paramsByGroup[group.groupId] || defaultParamsForJob(job);
        const perfRebuildEnabled = job.jobId !== 'perf-aggregation' || Boolean(params.rebuildAll);
        const conflict = job.taskId ? getTaskConflictInfo(job.taskId) : { activeManualRunCount: 0, hasAllScopeManualRun: false };
        const isTriggering = Boolean(triggeringByGroup[group.groupId]);
        const taskStatus = job.taskId ? taskStatusMap[job.taskId] : null;

        return html`
            <div class="col-md-6">
                <div class=${`card cron-group-card cron-group-${group.groupId}`}>
                    <div class="card-header cron-group-card-header">
                        <div class="d-flex align-items-start w-100">
                            <div class="flex-grow-1">
                                <h3 class="card-title mb-1">
                                    <i class=${`ti ${GROUP_ICONS[group.groupId] || 'ti-box'} me-2`}></i>
                                    ${group.title}
                                </h3>
                                <div class="text-muted small">${group.description}</div>
                            </div>
                            <div class="d-flex align-items-center gap-2 ms-2 flex-shrink-0">
                                <span class="badge cron-group-count-badge">${group.jobs.length} job${group.jobs.length === 1 ? '' : 's'}</span>
                                <button
                                    type="button"
                                    class="btn btn-sm btn-icon btn-ghost-secondary"
                                    onClick=${() => toggleGroup(group.groupId)}
                                    aria-label=${expandedGroups[group.groupId] ? 'Collapse' : 'Expand'}>
                                    <i class=${`ti ${expandedGroups[group.groupId] ? 'ti-chevron-up' : 'ti-chevron-down'}`}></i>
                                </button>
                            </div>
                        </div>
                    </div>
                    ${expandedGroups[group.groupId] && html`<div class="card-body">
                        <div class="row g-3">
                            <div class="col-md-6">
                                <label class="form-label fw-bold">Job</label>
                                <select class="form-select" value=${selectedJobByGroup[group.groupId] || job.jobId} onChange=${(e) => handleSelectJob(group, e.target.value)} disabled=${isTriggering}>
                                    ${group.jobs.map((item) => html`<option value=${item.jobId}>${item.title}${item.isAvailable ? '' : ' (planned)'}</option>`)}
                                </select>
                            </div>
                            <div class="col-md-6">
                                <label class="form-label fw-bold">Cadence</label>
                                <div class="form-control bg-light-subtle">${job.cadenceLabel} · ${job.scopeLabel}</div>
                            </div>
                            ${job.supportsMode && html`
                                <div class="col-md-4">
                                    <label class="form-label fw-bold">Mode</label>
                                    <select class="form-select" value=${params.mode || ''} onChange=${(e) => updateGroupParams(group.groupId, { mode: e.target.value })} disabled=${isTriggering}>
                                        ${(job.modes || []).map((mode) => html`<option value=${mode.value}>${mode.label}</option>`)}
                                    </select>
                                </div>
                            `}
                            ${job.supportsOrg && html`
                                <div class="col-md-4">
                                    <label class="form-label fw-bold">Organization (OrgId)</label>
                                    <input
                                        type="text"
                                        class="form-control"
                                        value=${params.orgId || ''}
                                        placeholder="All enabled organizations (leave blank)"
                                        onInput=${(e) => updateGroupParams(group.groupId, { orgId: e.target.value })}
                                        disabled=${isTriggering}
                                    />
                                    <div class="form-text">Type an exact OrgId to scope this run.</div>
                                </div>
                            `}
                            ${job.supportsRange && html`
                                <div class="col-md-4">
                                    <label class="form-label fw-bold">Time Range</label>
                                    <div class="d-flex gap-2 align-items-center">
                                        <input type="date" class="form-control" value=${params.startDate || ''} onChange=${(e) => updateGroupParams(group.groupId, { startDate: e.target.value })} disabled=${isTriggering || !perfRebuildEnabled} />
                                        <span class="text-muted">–</span>
                                        <input type="date" class="form-control" value=${params.endDate || ''} onChange=${(e) => updateGroupParams(group.groupId, { endDate: e.target.value })} disabled=${isTriggering || !perfRebuildEnabled} />
                                    </div>
                                    ${job.jobId === 'perf-aggregation' && !params.rebuildAll && html`<div class="form-text">Enable the rebuild checkbox below to scope the retained-window rebuild by date range.</div>`}
                                </div>
                            `}
                            ${job.supportsRetention && html`
                                <div class="col-md-4">
                                    <label class="form-label fw-bold">Retention Days</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="450"
                                        class="form-control"
                                        value=${params.retentionDays || ''}
                                        placeholder="450"
                                        onChange=${(e) => updateGroupParams(group.groupId, { retentionDays: e.target.value })}
                                        disabled=${isTriggering}
                                    />
                                    <div class="form-text">Deletes from T-${params.retentionDays || '450'} to selected end date (or now if not provided).</div>
                                </div>
                            `}
                            ${job.jobId === 'perf-aggregation' && html`
                                <div class="col-12">
                                    <label class="form-check">
                                        <input
                                            class="form-check-input"
                                            type="checkbox"
                                            checked=${Boolean(params.rebuildAll)}
                                            onChange=${(e) => updateGroupParams(group.groupId, { rebuildAll: e.target.checked })}
                                            disabled=${isTriggering}
                                        />
                                        <span class="form-check-label">
                                            Rebuild retained raw telemetry window instead of running only the normal continuous aggregation pass
                                        </span>
                                    </label>
                                    <div class="form-text">Unchecked: run the normal 8h + overlap pass. Checked: rebuild from retained raw perf telemetry for the selected org/date scope, capped by 7-day raw retention.</div>
                                </div>
                            `}
                        </div>

                        <div class="mt-3">
                            <div class="fw-semibold mb-1">${job.title}</div>
                            <div class="text-muted small">${job.description}</div>
                            ${!job.isAvailable && html`
                                <div class="alert alert-warning mt-3 mb-0">
                                    <i class="ti ti-hourglass me-1"></i>
                                    ${job.availabilityNote || 'This job is currently unavailable for manual execution.'}
                                </div>
                            `}
                            ${job.isAvailable && (conflict.activeManualRunCount > 0 || conflict.hasAllScopeManualRun) && html`
                                <div class="alert alert-warning mt-3 mb-0">
                                    <div class="d-flex flex-wrap gap-2 align-items-center">
                                        <span><i class="ti ti-alert-triangle me-1"></i>${conflict.activeManualRunCount} active manual run(s)</span>
                                        ${conflict.hasAllScopeManualRun && html`<span class="badge bg-danger text-white">All Scope Busy</span>`}
                                    </div>
                                </div>
                            `}
                            ${job.supportsMode && html`<div class="form-text mt-2">Smart mode is available for scoped rebuilds and default cadence execution.</div>`}
                            ${job.jobId === 'perf-aggregation' && html`<div class="form-text mt-2">User-facing perf page Refresh stays cheap. Use this job when you explicitly want a retained-window rebuild.</div>`}
                            ${taskStatus && html`<div class="small text-muted mt-2">Last run: ${taskStatus.lastRunAt ? new Date(taskStatus.lastRunAt).toLocaleString() : 'Never'}</div>`}
                        </div>

                        <div class="mt-4 d-flex gap-2 flex-wrap align-items-center">
                            <button class="btn btn-primary" onClick=${() => handleTriggerCron(group, job)} disabled=${isTriggering || !job.isAvailable}>
                                ${isTriggering ? html`<span class="spinner-border spinner-border-sm me-2"></span>Queueing...` : html`<i class="ti ti-player-play me-1"></i>Queue Job`}
                            </button>
                            <button class="btn btn-outline-secondary" onClick=${loadCatalog} disabled=${loadingCatalog}>
                                <i class="ti ti-refresh me-1"></i>
                                Refresh
                            </button>
                            <label class="form-check form-check-inline mb-0 ms-2" title="If queueing fails because a previous run is still marked Queued/Running, automatically clear stale rows (only kills rows whose process has been silent >2 min, since the heartbeat ticker fires every 30 s) and retry once.">
                                <input
                                    class="form-check-input"
                                    type="checkbox"
                                    checked=${Boolean(params.forceClearStale)}
                                    onChange=${(e) => updateGroupParams(group.groupId, { forceClearStale: e.target.checked })}
                                    disabled=${isTriggering || !job.isAvailable}
                                />
                                <span class="form-check-label small">Force clear stale on conflict</span>
                            </label>
                        </div>

                        ${renderResult(group.groupId)}
                        ${renderHistory(group, job)}
                    </div>`}
                </div>
            </div>
        `;
    };

    return html`
        <div class="row g-3 admin-actions-surface">
            <div class="col-12">
                <div class="card cron-catalog-shell">
                    <div class="card-header">
                        <div class="d-flex align-items-center">
                            <h3 class="card-title mb-0">
                                <i class="ti ti-clock me-2"></i>
                                Cron Jobs
                            </h3>
                            <button class="btn btn-sm btn-link ms-auto" onClick=${loadCatalog} disabled=${loadingCatalog}>
                                <i class="ti ${loadingCatalog ? 'ti-loader-3 spinner-border spinner-border-sm' : 'ti-refresh'} me-1"></i>
                                Refresh Catalog
                            </button>
                        </div>
                    </div>
                    <div class="card-body">
                        ${tasksError && html`
                            <div class="alert alert-danger mb-3">
                                <i class="ti ti-alert-circle me-2"></i>
                                <strong>Error loading catalog:</strong> ${tasksError}
                            </div>
                        `}

                        ${loadingCatalog ? html`
                            <div class="text-center py-4">
                                <div class="spinner-border" role="status">
                                    <span class="visually-hidden">Loading catalog...</span>
                                </div>
                                <p class="text-muted mt-2">Loading grouped cron catalog...</p>
                            </div>
                        ` : catalogGroups.length === 0 ? html`
                            <div class="empty py-4">
                                <p class="empty-title">No cron jobs found</p>
                                <p class="empty-subtitle text-muted">The grouped cron catalog is empty.</p>
                            </div>
                        ` : html`
                            <div class="alert alert-info mb-4">
                                <i class="ti ti-info-circle me-2"></i>
                                <strong>Grouped Cron Catalog:</strong> use per-job scope controls (OrgId, mode, date range, retention) to run targeted manual jobs and monitor execution state from the same view.
                            </div>

                            <div class="row g-3">
                                ${catalogGroups.map((group) => renderGroupCard(group))}
                            </div>

                            <div class="mt-4 pt-3 border-top">
                                <a href="#" onClick=${(e) => { e.preventDefault(); navigateToCronActivity(); loadCronStatus?.(); }} class="btn btn-link btn-sm px-0">
                                    <i class="ti ti-history me-1"></i>
                                    View Cron Execution History & Details
                                </a>
                            </div>
                        `}
                    </div>
                </div>
            </div>

            <div class="col-12">
                <div class="card border-warning">
                    <div class="card-header bg-warning-lt text-warning">
                        <div class="d-flex align-items-center w-100">
                            <h3 class="card-title mb-0">
                                <i class="ti ti-alert-triangle me-2"></i>
                                Reset Remediation Status
                            </h3>
                            <button
                                type="button"
                                class="btn btn-sm btn-warning ms-auto"
                                onClick=${() => setShowResetRemediation((prev) => !prev)}>
                                <i class=${`ti ${showResetRemediation ? 'ti-chevron-up' : 'ti-chevron-down'} me-1`}></i>
                                ${showResetRemediation ? 'Collapse' : 'Expand'}
                            </button>
                        </div>
                    </div>
                    ${showResetRemediation && html`<div class="card-body">
                        <div class="alert alert-warning mb-3">
                            <div class="d-flex">
                                <div>
                                    <i class="ti ti-alert-triangle me-2"></i>
                                    <strong>Privilege Action:</strong> This operation resets remediation status (AppStatus and RemediatedOn) in AppTelemetry and CVETelemetry tables. Use only for testing remediation detection logic.
                                </div>
                            </div>
                        </div>

                        <div class="row g-3">
                            <div class="col-md-6">
                                <label class="form-label fw-bold">Organization (OrgId)</label>
                                <input
                                    type="text"
                                    class="form-control"
                                    value=${resetOrgId}
                                    placeholder="Enter OrgId (for example: TEST-GIGA-BITS)"
                                    onInput=${(e) => setResetOrgId(e.target.value)}
                                    disabled=${resettingRemediation}
                                />
                            </div>
                            <div class="col-md-6 align-self-end">
                                <button class="btn btn-warning w-100" onClick=${handleResetRemediation} disabled=${resettingRemediation || !resetOrgId}>
                                    ${resettingRemediation ? html`<span class="spinner-border spinner-border-sm me-2"></span>Resetting...` : html`<i class="ti ti-restore me-2"></i>Reset Remediation Status`}
                                </button>
                            </div>
                        </div>

                        ${resetResult && html`
                            <div class="alert ${resetResult.success ? 'alert-success' : 'alert-danger'} mt-3" role="alert">
                                <div class="d-flex align-items-start">
                                    <div class="flex-grow-1">
                                        <strong>
                                            <i class="${resetResult.success ? 'ti ti-check-circle' : 'ti ti-alert-circle'} me-2"></i>
                                            ${resetResult.success ? 'Remediation status reset successfully' : 'Failed to reset remediation status'}
                                        </strong>
                                    </div>
                                    <button type="button" class="btn-close ms-3" onClick=${() => setResetResult(null)}></button>
                                </div>
                                ${resetResult.data && html`
                                    <div class="mt-3 pt-3 border-top">
                                        <div class="row g-2">
                                            <div class="col-6">
                                                <div class="text-muted small">App Records Reset</div>
                                                <div class="fw-bold text-danger fs-5">${resetResult.data.appRecordsReset || 0}</div>
                                            </div>
                                            <div class="col-6">
                                                <div class="text-muted small">CVE Records Reset</div>
                                                <div class="fw-bold text-danger fs-5">${resetResult.data.cveRecordsReset || 0}</div>
                                            </div>
                                        </div>
                                    </div>
                                `}
                                ${resetResult.error && html`
                                    <div class="mt-3 pt-3 border-top">
                                        <div class="alert alert-danger mb-0" style="word-break: break-word;">
                                            <code>${resetResult.error}</code>
                                        </div>
                                    </div>
                                `}
                            </div>
                        `}
                    </div>`}
                </div>
            </div>
        </div>
    `;
}
