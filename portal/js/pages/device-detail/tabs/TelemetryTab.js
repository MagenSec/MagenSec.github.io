/**
 * Signal History Tab - Device evidence packets and field-level changes
 * 
 * Displays a customer-facing history of device signals and changes detected over time.
 * Raw field names are kept behind compact evidence rows so the operator sees meaning first.
 */
import { PiiDecryption } from '@utils/piiDecryption.js';

export function renderTelemetryTab(component) {
    const { html } = window;
    
    const telemetryData = component.state.telemetryDetail;
    const telemetryHistory = component.state.telemetryHistory || [];
    const changes = telemetryData?.changes || [];
    
    if (!telemetryData || (!telemetryHistory.length && !changes.length)) {
        return html`
            <div class="alert alert-info">
                <i class="ti ti-info-circle me-2"></i>
                No signal history available yet.
            </div>
        `;
    }
    
    // Build timeline from history and changes
    const timeline = [];
    
    (telemetryHistory || []).forEach((snapshot, idx) => {
        timeline.push({
            type: 'snapshot',
            timestamp: snapshot.timestamp || snapshot.Timestamp,
            snapshot: snapshot,
            index: idx
        });
    });
    
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

    const parseIpEvidence = (value) => {
        if (typeof component.parseIpAddresses === 'function') {
            const parsed = component.parseIpAddresses(value);
            if (parsed.length) return parsed;
        }

        if (Array.isArray(value)) return value.map(ip => String(ip || '').trim()).filter(Boolean);

        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (!trimmed) return [];

            try {
                const parsed = JSON.parse(trimmed);
                if (Array.isArray(parsed)) return parsed.map(ip => String(ip || '').trim()).filter(Boolean);
                if (parsed && typeof parsed === 'object') {
                    return Object.values(parsed).flat().map(ip => String(ip || '').trim()).filter(ip => /\d+\.\d+\.\d+\.\d+/.test(ip));
                }
            } catch {
                // fall through to delimited string parsing
            }

            return trimmed.split(/[;,\s]+/).map(ip => ip.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
        }

        return [];
    };

    const normalizeSignalValue = (key, label, value) => {
        const keyText = String(key || label || '').toLowerCase();
        if (keyText.includes('ipaddress')) {
            const ips = [...new Set(parseIpEvidence(value))];
            return { kind: 'ips', ips, title: ips.join(', ') || String(value || '') };
        }

        if (keyText.includes('host') || keyText.includes('machine') || keyText.includes('user')) {
            const decoded = PiiDecryption.decryptIfEncrypted(String(value || ''));
            return { kind: 'text', value: decoded || '—', title: decoded || String(value || '') };
        }

        return { kind: 'text', value: formatValue(value), title: typeof value === 'object' ? JSON.stringify(value) : String(value ?? '') };
    };

    const renderSignalValue = (key, label, value) => {
        const normalized = normalizeSignalValue(key, label, value);
        if (normalized.kind === 'ips') {
            if (!normalized.ips.length) return html`<div class="font-weight-medium text-muted">—</div>`;
            return html`
                <div class="signal-ip-list" title=${normalized.title}>
                    ${normalized.ips.slice(0, 3).map(ip => html`<code>${ip}</code>`)}
                    ${normalized.ips.length > 3 ? html`<span class="badge bg-secondary-lt text-secondary">+${normalized.ips.length - 3}</span>` : ''}
                </div>
            `;
        }

        return html`<div class="font-weight-medium text-truncate" title=${normalized.title}>${normalized.value}</div>`;
    };

    const metadataKeys = new Set(['odata.etag', 'partitionkey', 'rowkey', 'timestamp', 'etag']);
    const preferredFields = [
        ['Hostname', 'Host'],
        ['MachineName', 'Machine'],
        ['ClientVersion', 'Agent'],
        ['OSVersion', 'OS'],
        ['CurrentUser', 'User'],
        ['IPAddresses', 'IP evidence'],
        ['PublicEgressHint', 'Egress'],
        ['LastScanEnd', 'Scan finished'],
        ['CPUArch', 'Architecture'],
        ['BIOSVersion', 'BIOS']
    ];
    const isSignalField = (key) => !metadataKeys.has(String(key || '').toLowerCase());
    const collectSignalFields = (fields, limit = 6) => {
        const preferred = preferredFields
            .map(([key, label]) => [key, label, fields[key] ?? fields[key.charAt(0).toLowerCase() + key.slice(1)]])
            .filter(([, , value]) => value !== undefined && value !== null && value !== '')
            .slice(0, limit);
        if (preferred.length) return preferred;
        return Object.entries(fields)
            .filter(([key, value]) => isSignalField(key) && value !== undefined && value !== null && value !== '')
            .slice(0, limit)
            .map(([key, value]) => [key, key, value]);
    };

    const latest = telemetryData.latest || telemetryHistory[0] || {};
    const latestTimestamp = latest.timestamp || latest.Timestamp;
    const latestFields = latest.fields || latest || {};
    const fieldCount = Object.keys(latestFields).filter(isSignalField).length;
    const visibleFields = collectSignalFields(latestFields);
    
    return html`
        <div class="signal-history">
            <div class="row row-cards mb-3">
                <div class="col-md-4">
                    <div class="card h-100">
                        <div class="card-body">
                            <div class="text-muted small">Latest signal</div>
                            <div class="fw-semibold">${latestTimestamp ? formatDate(latestTimestamp) : 'Not available'}</div>
                            <div class="text-muted small">Last device evidence received by the portal.</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card h-100">
                        <div class="card-body">
                            <div class="text-muted small">Evidence packets</div>
                            <div class="fw-semibold">${telemetryHistory.length}</div>
                            <div class="text-muted small">Historical reports available for trend and drift review.</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-4">
                    <div class="card h-100">
                        <div class="card-body">
                            <div class="text-muted small">Changed fields</div>
                            <div class="fw-semibold">${changes.length}</div>
                            <div class="text-muted small">Configuration or posture changes detected between reports.</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="card mb-3">
                <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
                    <div>
                        <div class="card-title mb-0">Latest Signal Summary</div>
                        <div class="text-muted small">${fieldCount} observed fields from ${latestTimestamp ? formatDate(latestTimestamp) : 'the latest device report'}.</div>
                    </div>
                    <span class="badge bg-info-lt text-info">Device signals</span>
                </div>
                <div class="card-body">
                    <div class="row g-2 small">
                        ${visibleFields.map(([fieldKey, label, val]) => html`
                            <div class="col-sm-6 col-lg-4">
                                <div class="signal-field">
                                    <div class="text-muted">${label}</div>
                                    ${renderSignalValue(fieldKey, label, val)}
                                </div>
                            </div>
                        `)}
                    </div>
                </div>
            </div>
            
            <div class="timeline-container">
                ${timeline.slice(0, 50).map((item, idx) => {
                    if (item.type === 'snapshot') {
                        const snapshot = item.snapshot;
                        const fields = snapshot.fields || snapshot || {};
                        const timestamp = snapshot.timestamp || snapshot.Timestamp || new Date().toISOString();
                        const snapshotFields = collectSignalFields(fields);
                        const snapshotFieldCount = Object.keys(fields).filter(isSignalField).length;
                        
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
                                                    <strong>Evidence Packet</strong>
                                                    <div class="text-muted">${formatDate(timestamp)}</div>
                                                </div>
                                                <span class="badge bg-info-lt text-info">Signal</span>
                                            </div>
                                        </div>
                                        <div class="card-body py-2">
                                            <div class="row g-2 small">
                                                ${snapshotFields.map(([fieldKey, label, val]) => html`
                                                    <div class="col-6">
                                                                                <div class="text-muted">${label}</div>
                                                                                ${renderSignalValue(fieldKey, label, val)}
                                                    </div>
                                                `)}
                                            </div>
                                            ${snapshotFieldCount > snapshotFields.length ? html`
                                                <div class="mt-2 text-muted small">
                                                    +${snapshotFieldCount - snapshotFields.length} more observed fields
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
                                                <span class="badge bg-warning-lt text-warning">Changed</span>
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
                    Showing first 50 signal events of ${timeline.length} total
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
