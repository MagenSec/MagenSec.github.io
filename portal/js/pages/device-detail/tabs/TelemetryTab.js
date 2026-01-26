/**
 * Telemetry Tab - Device telemetry history and field-level changes
 * 
 * Displays a timeline of telemetry snapshots and field changes detected over time.
 * Includes visual timeline with markers for snapshots vs changes.
 */
export function renderTelemetryTab(component) {
    const { html } = window;
    
    const telemetryData = component.state.telemetryDetail;
    const telemetryHistory = component.state.telemetryHistory || [];
    const changes = telemetryData?.changes || [];
    
    if (!telemetryData || (!telemetryHistory.length && !changes.length)) {
        return html`
            <div class="alert alert-info">
                <svg class="icon me-2" width="20" height="20"><path stroke="currentColor" stroke-width="2" fill="none" d="M12 2c5.523 0 10 4.477 10 10s-4.477 10-10 10S2 17.523 2 12 6.477 2 12 2z"/><path d="M12 7v5"/><circle cx="12" cy="16" r="1"/></svg>
                No telemetry history available
            </div>
        `;
    }
    
    // Build timeline from history and changes
    const timeline = [];
    
    // Add history snapshots
    (telemetryHistory || []).forEach((snapshot, idx) => {
        timeline.push({
            type: 'snapshot',
            timestamp: snapshot.timestamp || snapshot.Timestamp,
            snapshot: snapshot,
            index: idx
        });
    });
    
    // Add field-level changes
    (changes || []).forEach((change, idx) => {
        timeline.push({
            type: 'change',
            timestamp: change.timestamp,
            field: change.fieldName,
            oldValue: change.oldValue,
            newValue: change.newValue,
            index: idx
        });
    });
    
    // Sort by timestamp descending (newest first)
    timeline.sort((a, b) => {
        const aTime = new Date(a.timestamp || 0).getTime();
        const bTime = new Date(b.timestamp || 0).getTime();
        return bTime - aTime;
    });
    
    const formatDate = (dateStr) => {
        try {
            return new Date(dateStr).toLocaleString();
        } catch {
            return dateStr;
        }
    };
    
    const formatValue = (val) => {
        if (typeof val === 'boolean') return val ? 'Yes' : 'No';
        if (!val) return '—';
        if (typeof val === 'object') return JSON.stringify(val);
        return String(val).substring(0, 100);
    };
    
    return html`
        <div class="telemetry-timeline">
            <div class="mb-3">
                <div class="text-muted small">
                    <strong>${telemetryHistory.length}</strong> telemetry snapshots · 
                    <strong>${changes.length}</strong> field changes detected
                </div>
            </div>
            
            <div class="timeline-container">
                ${timeline.slice(0, 50).map((item, idx) => {
                    if (item.type === 'snapshot') {
                        const snapshot = item.snapshot;
                        const fields = snapshot.fields || snapshot || {};
                        const timestamp = snapshot.timestamp || snapshot.Timestamp || new Date().toISOString();
                        
                        return html`
                            <div class="timeline-item mb-3" key=${idx}>
                                <div class="timeline-marker">
                                    <div class="timeline-dot" style="background: #4299e1;"></div>
                                </div>
                                <div class="timeline-content">
                                    <div class="card">
                                        <div class="card-header py-2">
                                            <div class="d-flex align-items-center justify-content-between">
                                                <div class="small">
                                                    <strong>Telemetry Snapshot</strong>
                                                    <div class="text-muted">${formatDate(timestamp)}</div>
                                                </div>
                                                <span class="badge bg-info-lt text-info">Snapshot</span>
                                            </div>
                                        </div>
                                        <div class="card-body py-2">
                                            <div class="row g-2 small">
                                                ${Object.entries(fields).slice(0, 6).map(([key, val]) => html`
                                                    <div class="col-6">
                                                        <div class="text-muted">${key}</div>
                                                        <div class="font-weight-medium text-truncate" title=${String(val)}>
                                                            ${formatValue(val)}
                                                        </div>
                                                    </div>
                                                `)}
                                            </div>
                                            ${Object.keys(fields).length > 6 ? html`
                                                <div class="mt-2 text-muted small">
                                                    +${Object.keys(fields).length - 6} more fields
                                                </div>
                                            ` : ''}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `;
                    } else if (item.type === 'change') {
                        const severity = item.newValue === 'Critical' || item.newValue === 'High' ? 'danger' : 'info';
                        
                        return html`
                            <div class="timeline-item mb-3" key=${idx}>
                                <div class="timeline-marker">
                                    <div class="timeline-dot" style="background: #f76707;"></div>
                                </div>
                                <div class="timeline-content">
                                    <div class="card border-${severity}">
                                        <div class="card-header py-2">
                                            <div class="d-flex align-items-center justify-content-between">
                                                <div class="small">
                                                    <strong>${item.field}</strong>
                                                    <div class="text-muted">${formatDate(item.timestamp)}</div>
                                                </div>
                                                <span class="badge bg-warning-lt text-warning">Change</span>
                                            </div>
                                        </div>
                                        <div class="card-body py-2">
                                            <div class="row g-2 small">
                                                <div class="col-6">
                                                    <div class="text-muted">From</div>
                                                    <div class="font-weight-medium text-truncate text-danger" title=${String(item.oldValue)}>
                                                        ${formatValue(item.oldValue)}
                                                    </div>
                                                </div>
                                                <div class="col-6">
                                                    <div class="text-muted">To</div>
                                                    <div class="font-weight-medium text-truncate text-success" title=${String(item.newValue)}>
                                                        ${formatValue(item.newValue)}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `;
                    }
                })}
            </div>
            
            ${timeline.length > 50 ? html`
                <div class="alert alert-info small mt-3">
                    Showing first 50 items of ${timeline.length} total
                </div>
            ` : ''}
        </div>
        
        <style>
            .timeline-container {
                position: relative;
                padding-left: 20px;
            }
            
            .timeline-item {
                position: relative;
                padding-left: 20px;
            }
            
            .timeline-item::before {
                content: '';
                position: absolute;
                left: -3px;
                top: 30px;
                bottom: -30px;
                width: 1px;
                background: #e0e0e0;
            }
            
            .timeline-item:last-child::before {
                display: none;
            }
            
            .timeline-marker {
                position: absolute;
                left: -10px;
                top: 5px;
            }
            
            .timeline-dot {
                width: 16px;
                height: 16px;
                border-radius: 50%;
                border: 2px solid white;
                box-shadow: 0 0 0 2px #e0e0e0;
            }
        </style>
    `;
}
