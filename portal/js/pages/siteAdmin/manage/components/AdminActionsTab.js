/**
 * AdminActionsTab - Administrative actions UI with dynamic cron task discovery
 * Features:
 * - Dynamically loads available cron tasks from backend
 * - Professional task card selector with descriptions
 * - On-demand task execution with results
 * - Remediation reset functionality
 * - Audit logging for all operations
 */

const { html } = window;
const { useState, useEffect } = window.preactHooks;

export function AdminActionsTab({ orgs = [], onTriggerCron, onResetRemediation, setMainSection, setActiveTab, loadCronStatus }) {
    const safeOrgs = Array.isArray(orgs) ? orgs : [];
    const [cronTasks, setCronTasks] = useState([]);
    const [loadingTasks, setLoadingTasks] = useState(true);
    const [tasksError, setTasksError] = useState(null);
    
    const [selectedTaskId, setSelectedTaskId] = useState(null);
    const [triggeringCron, setTriggeringCron] = useState(false);
    const [cronResult, setCronResult] = useState(null);
    
    const [resetOrgId, setResetOrgId] = useState('');
    const [resettingRemediation, setResettingRemediation] = useState(false);
    const [resetResult, setResetResult] = useState(null);

    // Load available cron tasks on mount
    useEffect(() => {
        loadAvailableTasks();
    }, []);

    const loadAvailableTasks = async () => {
        try {
            setLoadingTasks(true);
            setTasksError(null);
            const response = await window.api.adminGetAvailableCronTasks();
            
            if (response?.success && Array.isArray(response.data)) {
                setCronTasks(response.data);
                if (response.data.length > 0) {
                    setSelectedTaskId(response.data[0].taskId);
                }
            } else {
                setTasksError(response?.message || 'Failed to load cron tasks');
            }
        } catch (error) {
            console.error('[AdminActionsTab] Failed to load cron tasks:', error);
            setTasksError(error.message || 'Failed to load cron tasks');
        } finally {
            setLoadingTasks(false);
        }
    };

    const handleTriggerCron = async () => {
        if (!selectedTaskId) return;
        
        setTriggeringCron(true);
        setCronResult(null);
        try {
            const result = await onTriggerCron(selectedTaskId);
            if (result.success) {
                setCronResult({ success: true, taskId: selectedTaskId, data: result.data });
            } else {
                setCronResult({ success: false, taskId: selectedTaskId, error: result.message });
            }
        } catch (error) {
            setCronResult({ success: false, taskId: selectedTaskId, error: error.message });
        } finally {
            setTriggeringCron(false);
        }
    };

    const handleResetRemediation = async () => {
        if (!resetOrgId) return;
        
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

    return html`
        <div class="row g-3">
            <!-- Cron Job Triggers - Dynamic Task Selector -->
            <div class="col-12">
                <div class="card">
                    <div class="card-header">
                        <div class="d-flex align-items-center">
                            <h3 class="card-title mb-0">
                                <i class="ti ti-clock me-2"></i>
                                Manual Cron Job Triggers
                            </h3>
                            <button 
                                class="btn btn-sm btn-link ms-auto"
                                onClick=${loadAvailableTasks}
                                disabled=${loadingTasks}
                            >
                                <i class="ti ${loadingTasks ? 'ti-loader-3 spinner-border spinner-border-sm' : 'ti-refresh'} me-1"></i>
                                Refresh List
                            </button>
                        </div>
                    </div>
                    <div class="card-body">
                        ${tasksError && html`
                            <div class="alert alert-danger mb-3">
                                <i class="ti ti-alert-circle me-2"></i>
                                <strong>Error loading tasks:</strong> ${tasksError}
                            </div>
                        `}

                        ${loadingTasks ? html`
                            <div class="text-center py-4">
                                <div class="spinner-border" role="status">
                                    <span class="visually-hidden">Loading tasks...</span>
                                </div>
                                <p class="text-muted mt-2">Loading available cron tasks...</p>
                            </div>
                        ` : cronTasks.length === 0 ? html`
                            <div class="empty py-4">
                                <p class="empty-title">No cron tasks found</p>
                                <p class="empty-subtitle text-muted">No cron tasks are currently registered in the system.</p>
                            </div>
                        ` : html`
                            <!-- Task Selector Cards -->
                            <div class="mb-4">
                                <label class="form-label fw-bold">Select a Cron Job to Execute</label>
                                <div class="row g-2">
                                    ${cronTasks.map(task => html`
                                        <div class="col-md-6 col-lg-4">
                                            <div 
                                                class="card cursor-pointer transition h-100 ${selectedTaskId === task.taskId ? 'border-primary shadow-sm' : 'border-light'}"
                                                onClick=${() => setSelectedTaskId(task.taskId)}
                                                style="cursor: pointer; transition: all 0.2s ease; background: ${selectedTaskId === task.taskId ? '#f0f6ff' : 'white'};"
                                            >
                                                <div class="card-body">
                                                    <div class="d-flex align-items-start mb-2">
                                                        <div class="flex-grow-1">
                                                            <div class="fw-bold text-dark">${task.displayName}</div>
                                                        </div>
                                                        ${selectedTaskId === task.taskId && html`
                                                            <i class="ti ti-check ms-2 text-primary fw-bold" style="font-size: 18px;"></i>
                                                        `}
                                                    </div>
                                                    <div class="text-muted small mb-2" style="min-height: 40px; overflow-y: auto;" title=${task.description}>${task.description}</div>
                                                    <div>
                                                        <span class="badge bg-info">
                                                            <i class="ti ti-clock me-1"></i>
                                                            Every ${task.frequencyHours}h
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    `)}
                                </div>
                            </div>

                            <!-- Selected Task Details & Trigger -->
                            ${(() => {
                                const task = cronTasks.find(t => t.taskId === selectedTaskId);
                                return task ? html`
                                    <div class="alert alert-light-blue border-blue mb-3">
                                        <div class="d-flex">
                                            <div class="flex-grow-1">
                                                <div class="alert-title">
                                                    <i class="ti ti-info-circle me-1"></i>
                                                    Task Details
                                                </div>
                                                <div class="text-muted small">
                                                    <div class="mb-2">
                                                        <strong>Task ID:</strong> <code>${task.taskId}</code>
                                                    </div>
                                                    <div class="mb-2">
                                                        <strong>Description:</strong> ${task.description}
                                                    </div>
                                                    <div>
                                                        <strong>Schedule:</strong> Runs every <strong>${task.frequencyHours}</strong> hour${task.frequencyHours > 1 ? 's' : ''}
                                                    </div>
                                                </div>
                                            </div>
                                            <button 
                                                class="btn btn-primary ms-3 align-self-center"
                                                onClick=${handleTriggerCron}
                                                disabled=${triggeringCron}
                                                style="white-space: nowrap;"
                                            >
                                                ${triggeringCron ? html`
                                                    <span class="spinner-border spinner-border-sm me-2"></span>
                                                    Executing...
                                                ` : html`
                                                    <i class="ti ti-player-play me-1"></i>
                                                    Trigger Now
                                                `}
                                            </button>
                                        </div>
                                    </div>
                                ` : '';
                            })()}

                            <!-- Execution Result -->
                            ${cronResult && html`
                                <div class="alert ${cronResult.success ? 'alert-success' : 'alert-danger'} mt-3" role="alert">
                                    <div class="d-flex align-items-start">
                                        <div class="flex-grow-1">
                                            <strong>
                                                <i class="${cronResult.success ? 'ti ti-check-circle' : 'ti ti-alert-circle'} me-2"></i>
                                                ${cronResult.taskId}
                                            </strong>
                                            <div class="mt-1 small">${cronResult.success ? 'Completed successfully' : 'Failed'}</div>
                                        </div>
                                        <button 
                                            type="button" 
                                            class="btn-close ms-3" 
                                            onClick=${() => setCronResult(null)}
                                        ></button>
                                    </div>
                                    ${cronResult.data && html`
                                        <div class="mt-3 pt-3 border-top">
                                            <div class="row g-3 small">
                                                ${cronResult.data.itemsProcessed !== undefined && html`
                                                    <div class="col-6">
                                                        <div class="text-muted">Items Processed</div>
                                                        <div class="fw-bold fs-5">${cronResult.data.itemsProcessed}</div>
                                                    </div>
                                                `}
                                                ${cronResult.data.duration && html`
                                                    <div class="col-6">
                                                        <div class="text-muted">Duration</div>
                                                        <div class="fw-bold fs-5">${cronResult.data.duration}</div>
                                                    </div>
                                                `}
                                            </div>
                                        </div>
                                    `}
                                    ${cronResult.error && html`
                                        <div class="mt-3 pt-3 border-top">
                                            <div class="alert alert-danger mb-0" style="word-break: break-word;">
                                                <code>${cronResult.error}</code>
                                            </div>
                                        </div>
                                    `}
                                </div>
                            `}

                            <!-- Link to Cron History -->
                            <div class="mt-3 pt-3 border-top">
                                <a href="#" onClick=${(e) => { e.preventDefault(); setMainSection('activity'); setActiveTab('cron-jobs'); loadCronStatus?.(); }} class="btn btn-link btn-sm">
                                    <i class="ti ti-history me-1"></i>
                                    View Cron Execution History & Details
                                </a>
                            </div>
                        `}
                    </div>
                </div>
            </div>

            <!-- Remediation Reset - Privilege Action -->
            <div class="col-12">
                <div class="card border-warning">
                    <div class="card-header bg-warning-lt">
                        <h3 class="card-title mb-0">
                            <i class="ti ti-alert-triangle me-2"></i>
                            Reset Remediation Status
                        </h3>
                    </div>
                    <div class="card-body">
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
                                <label class="form-label fw-bold">Organization</label>
                                <select 
                                    class="form-select" 
                                    value=${resetOrgId}
                                    onChange=${(e) => setResetOrgId(e.target.value)}
                                    disabled=${resettingRemediation || safeOrgs.length === 0}
                                >
                                    <option value="">Select organization...</option>
                                    ${safeOrgs.map(org => html`
                                        <option value=${org.orgId}>${org.orgName || org.name || org.orgId}</option>
                                    `)}
                                </select>
                            </div>
                            <div class="col-md-6 align-self-end">
                                <button 
                                    class="btn btn-warning w-100"
                                    onClick=${handleResetRemediation}
                                    disabled=${resettingRemediation || !resetOrgId}
                                >
                                    ${resettingRemediation ? html`
                                        <span class="spinner-border spinner-border-sm me-2"></span>
                                        Resetting...
                                    ` : html`
                                        <i class="ti ti-restore me-2"></i>
                                        Reset Remediation Status
                                    `}
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
                                    <button 
                                        type="button" 
                                        class="btn-close ms-3" 
                                        onClick=${() => setResetResult(null)}
                                    ></button>
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
                    </div>
                </div>
            </div>
        </div>
    `;
}
