/**
 * AdminActionsTab - Administrative actions UI (cron triggers, remediation reset)
 * Extracted from SiteAdmin.js
 */

const { html } = window;
const { useState } = window.preactHooks;

export function AdminActionsTab({ orgs, onTriggerCron, onResetRemediation, setMainSection, setActiveTab, loadCronStatus }) {
    const [triggeringCron, setTriggeringCron] = useState(null);
    const [cronResult, setCronResult] = useState(null);
    const [resetOrgId, setResetOrgId] = useState('');
    const [resettingRemediation, setResettingRemediation] = useState(false);
    const [resetResult, setResetResult] = useState(null);

    const handleTriggerCron = async (taskId) => {
        setTriggeringCron(taskId);
        setCronResult(null);
        try {
            const result = await onTriggerCron(taskId);
            if (result.success) {
                setCronResult({ success: true, taskId, data: result.data });
            } else {
                setCronResult({ success: false, taskId, error: result.message });
            }
        } catch (error) {
            setCronResult({ success: false, taskId, error: error.message });
        } finally {
            setTriggeringCron(null);
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
            <!-- Cron Job Triggers -->
            <div class="col-12">
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">
                            <i class="ti ti-clock me-2"></i>
                            Manual Cron Job Triggers
                        </h3>
                    </div>
                    <div class="card-body">
                        <p class="text-muted mb-3">
                            Manually trigger cron jobs for testing or immediate execution. Results will be logged to audit telemetry.
                        </p>
                        <div class="row g-3">
                            <div class="col-md-6">
                                <button 
                                    class="btn btn-primary w-100"
                                    onClick=${() => handleTriggerCron('AppRemediationDetection')}
                                    disabled=${triggeringCron === 'AppRemediationDetection'}
                                >
                                    ${triggeringCron === 'AppRemediationDetection' ? html`
                                        <span class="spinner-border spinner-border-sm me-2"></span>
                                        Triggering...
                                    ` : html`
                                        <i class="ti ti-refresh me-2"></i>
                                        Trigger App Remediation Detection
                                    `}
                                </button>
                                <small class="text-muted d-block mt-1">
                                    Detects app updates and marks CVEs as remediated
                                </small>
                            </div>
                            <div class="col-md-6">
                                <button 
                                    class="btn btn-primary w-100"
                                    onClick=${() => handleTriggerCron('ThreatIntelEnrichment')}
                                    disabled=${triggeringCron === 'ThreatIntelEnrichment'}
                                >
                                    ${triggeringCron === 'ThreatIntelEnrichment' ? html`
                                        <span class="spinner-border spinner-border-sm me-2"></span>
                                        Triggering...
                                    ` : html`
                                        <i class="ti ti-shield me-2"></i>
                                        Trigger Threat Intel Enrichment
                                    `}
                                </button>
                                <small class="text-muted d-block mt-1">
                                    Enriches CVEs with EPSS scores and exploit data
                                </small>
                            </div>
                        </div>
                        
                        ${cronResult && html`
                            <div class="alert ${cronResult.success ? 'alert-success' : 'alert-danger'} mt-3" role="alert">
                                <div class="d-flex align-items-center">
                                    <div>
                                        <i class="${cronResult.success ? 'ti ti-check' : 'ti ti-alert-circle'} me-2"></i>
                                        <strong>${cronResult.taskId}</strong>: ${cronResult.success ? 'Completed successfully' : 'Failed'}
                                    </div>
                                    <button 
                                        type="button" 
                                        class="btn-close ms-auto" 
                                        onClick=${() => setCronResult(null)}
                                    ></button>
                                </div>
                                ${cronResult.data && html`
                                    <div class="mt-2 small">
                                        ${cronResult.data.itemsProcessed !== undefined && html`
                                            <div>Items Processed: <strong>${cronResult.data.itemsProcessed}</strong></div>
                                        `}
                                        ${cronResult.data.duration && html`
                                            <div>Duration: <strong>${cronResult.data.duration}</strong></div>
                                        `}
                                    </div>
                                `}
                                ${cronResult.error && html`
                                    <div class="mt-2 small text-danger">${cronResult.error}</div>
                                `}
                            </div>
                        `}

                        <div class="mt-3">
                            <a href="#" onClick=${(e) => { e.preventDefault(); setMainSection('activity'); setActiveTab('cron-jobs'); loadCronStatus(); }} class="btn btn-link">
                                <i class="ti ti-external-link me-1"></i>
                                View Cron Job Details & History
                            </a>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Remediation Reset -->
            <div class="col-12">
                <div class="card border-warning">
                    <div class="card-header bg-warning-lt">
                        <h3 class="card-title">
                            <i class="ti ti-restore me-2"></i>
                            Reset Remediation Status
                        </h3>
                    </div>
                    <div class="card-body">
                        <div class="alert alert-warning mb-3">
                            <i class="ti ti-alert-triangle me-2"></i>
                            <strong>Warning:</strong> This action resets AppStatus and RemediatedOn timestamps in both AppTelemetry and CVETelemetry tables. Use for testing remediation detection logic.
                        </div>
                        
                        <div class="row g-3">
                            <div class="col-md-6">
                                <label class="form-label">Organization</label>
                                <select 
                                    class="form-select" 
                                    value=${resetOrgId}
                                    onChange=${(e) => setResetOrgId(e.target.value)}
                                    disabled=${resettingRemediation}
                                >
                                    <option value="">Select organization...</option>
                                    ${orgs.map(org => html`
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
                                <div class="d-flex align-items-center">
                                    <div>
                                        <i class="${resetResult.success ? 'ti ti-check' : 'ti ti-alert-circle'} me-2"></i>
                                        ${resetResult.success ? 'Remediation status reset successfully' : 'Failed to reset remediation status'}
                                    </div>
                                    <button 
                                        type="button" 
                                        class="btn-close ms-auto" 
                                        onClick=${() => setResetResult(null)}
                                    ></button>
                                </div>
                                ${resetResult.data && html`
                                    <div class="mt-2 small">
                                        <div>App Records Reset: <strong>${resetResult.data.appRecordsReset || 0}</strong></div>
                                        <div>CVE Records Reset: <strong>${resetResult.data.cveRecordsReset || 0}</strong></div>
                                    </div>
                                `}
                                ${resetResult.error && html`
                                    <div class="mt-2 small text-danger">${resetResult.error}</div>
                                `}
                            </div>
                        `}

                        <div class="mt-3">
                            <p class="text-muted small mb-0">
                                <strong>Effect:</strong> Sets AppStatus='installed' and RemediatedOn=null for all apps and CVEs in the organization. Next remediation job will re-detect updates.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}
