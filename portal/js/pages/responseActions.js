/**
 * Response Actions Page - Command queue with execution tracking
 * Coordinate security responses across multiple devices
 */

import { auth } from '../auth.js';
import { api } from '../api.js';
import { config } from '../config.js';
import { orgContext } from '../orgContext.js';

const { html, Component } = window;

export class ResponseActionsPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: true,
            error: null,
            commands: [],
            devices: [],
            selectedDevices: [],
            commandType: 'IsolateDevice',
            commandParams: '',
            executing: false
        };
        this.orgUnsubscribe = null;
        this.pollInterval = null;
    }

    componentDidMount() {
        this.orgUnsubscribe = orgContext.onChange(() => this.loadData());
        this.loadData();
        // Poll for command status updates every 10 seconds
        this.pollInterval = setInterval(() => this.loadCommands(), 10000);
    }

    componentWillUnmount() {
        if (this.orgUnsubscribe) this.orgUnsubscribe();
        if (this.pollInterval) clearInterval(this.pollInterval);
    }

    async loadData() {
        try {
            this.setState({ loading: true, error: null });
            
            await Promise.all([
                this.loadDevices(),
                this.loadCommands()
            ]);

            this.setState({ loading: false });
        } catch (error) {
            console.error('[ResponseActions] Load failed:', error);
            this.setState({ error: error.message, loading: false });
        }
    }

    async loadDevices() {
        const currentOrg = orgContext.getCurrentOrg();
        const user = auth.getUser();
        const orgId = currentOrg?.orgId || user.email;
        
        const response = await api.get(`/api/v1/orgs/${orgId}/devices`);
        if (response.success) {
            this.setState({ devices: response.data || [] });
        }
    }

    async loadCommands() {
        const user = auth.getUser();
        const currentOrg = orgContext.getCurrentOrg();
        const orgId = currentOrg?.orgId || user.email;

        try {
            const commands = await api.getCommandHistory(orgId);
            this.setState({ commands: commands || [] });
        } catch (error) {
            console.error('[ResponseActions] Load commands failed:', error);
        }
    }

    toggleDeviceSelection(deviceId) {
        const { selectedDevices } = this.state;
        if (selectedDevices.includes(deviceId)) {
            this.setState({ selectedDevices: selectedDevices.filter(id => id !== deviceId) });
        } else {
            this.setState({ selectedDevices: [...selectedDevices, deviceId] });
        }
    }

    selectAllDevices() {
        const { devices } = this.state;
        const activeDevices = devices.filter(d => d.state === 'Active').map(d => d.deviceId);
        this.setState({ selectedDevices: activeDevices });
    }

    clearSelection() {
        this.setState({ selectedDevices: [] });
    }

    async executeCommand() {
        const { selectedDevices, commandType, commandParams } = this.state;
        
        if (selectedDevices.length === 0) {
            alert('Please select at least one device');
            return;
        }

        if (!confirm(`Execute ${commandType} on ${selectedDevices.length} device(s)?`)) {
            return;
        }

        try {
            this.setState({ executing: true });
            
            const payload = {
                commandType,
                targetDevices: selectedDevices,
                parameters: commandParams
            };

            const result = await api.executeCommand(payload);
            
            if (result) {
                this.setState({ 
                    executing: false, 
                    selectedDevices: [],
                    commandParams: ''
                });
                
                await this.loadCommands();
                
                alert(`Command queued for ${selectedDevices.length} device(s)`);
            }
        } catch (error) {
            console.error('[ResponseActions] Execute failed:', error);
            alert('Failed to execute command: ' + error.message);
            this.setState({ executing: false });
        }
    }

    getCommandStatusBadge(status) {
        const classes = {
            'Pending': 'secondary text-white',
            'InProgress': 'info text-white',
            'Completed': 'success text-white',
            'Failed': 'danger text-white',
            'Timeout': 'warning text-white'
        };
        return classes[status] || 'secondary text-white';
    }

    render() {
        const { loading, error, commands, devices, selectedDevices, commandType, commandParams, executing } = this.state;

        if (loading) {
            return html`
                <div class="d-flex align-items-center justify-content-center" style="min-height: 60vh;">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                </div>
            `;
        }

        if (error) {
            return html`
                <div class="alert alert-danger">
                    <h4 class="alert-title">Error Loading Response Actions</h4>
                    <div class="text-secondary">${error}</div>
                </div>
            `;
        }

        const activeDevices = devices.filter(d => d.state === 'Active');

        return html`
            <div class="page-header d-print-none mb-3">
                <div class="container-xl">
                    <div class="row g-2 align-items-center">
                        <div class="col">
                            <h2 class="page-title">
                                <svg xmlns="http://www.w3.org/2000/svg" class="icon me-2" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><polyline points="9 11 12 14 20 6" /><path d="M20 12v6a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h9" /></svg>
                                Response Actions
                            </h2>
                            <div class="page-subtitle">
                                <span class="text-muted">Execute security commands across your fleet</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="page-body">
                <div class="container-xl">
                    <div class="row row-deck row-cards">
                        <!-- Command Execution Panel -->
                        <div class="col-lg-4">
                            <div class="card">
                                <div class="card-header">
                                    <h3 class="card-title">New Command</h3>
                                </div>
                                <div class="card-body">
                                    <div class="mb-3">
                                        <label class="form-label required">Command Type</label>
                                        <select class="form-select" value=${commandType} 
                                                onChange=${(e) => this.setState({ commandType: e.target.value })}>
                                            <option value="IsolateDevice">Isolate Device</option>
                                            <option value="CollectLogs">Collect Logs</option>
                                            <option value="ScanFullSystem">Full System Scan</option>
                                            <option value="TerminateProcess">Terminate Process</option>
                                            <option value="QuarantineFile">Quarantine File</option>
                                            <option value="UpdateDefinitions">Update Definitions</option>
                                        </select>
                                    </div>

                                    <div class="mb-3">
                                        <label class="form-label">Parameters (JSON)</label>
                                        <textarea class="form-control" rows="3" 
                                                  placeholder='{"processName": "malware.exe"}'
                                                  value=${commandParams}
                                                  onInput=${(e) => this.setState({ commandParams: e.target.value })}>
                                        </textarea>
                                        <small class="form-hint">Optional: Additional parameters for the command</small>
                                    </div>

                                    <div class="mb-3">
                                        <label class="form-label required">Target Devices</label>
                                        <div class="mb-2">
                                            <span class="badge bg-primary">${selectedDevices.length} selected</span>
                                            ${selectedDevices.length > 0 && html`
                                                <button type="button" class="btn btn-sm btn-link p-0 ms-2" 
                                                        onClick=${() => this.clearSelection()}>Clear</button>
                                            `}
                                            <button type="button" class="btn btn-sm btn-link p-0 ms-2" 
                                                    onClick=${() => this.selectAllDevices()}>Select All Active</button>
                                        </div>
                                        <div class="list-group list-group-flush" style="max-height: 300px; overflow-y: auto;">
                                            ${activeDevices.length === 0 ? html`
                                                <div class="text-muted text-center py-3">No active devices</div>
                                            ` : activeDevices.map(device => html`
                                                <label class="list-group-item">
                                                    <div class="form-check">
                                                        <input class="form-check-input" type="checkbox" 
                                                               checked=${selectedDevices.includes(device.deviceId)}
                                                               onChange=${() => this.toggleDeviceSelection(device.deviceId)} />
                                                        <span class="form-check-label">${device.deviceId}</span>
                                                    </div>
                                                </label>
                                            `)}
                                        </div>
                                    </div>

                                    <button type="button" class="btn btn-primary w-100" 
                                            disabled=${executing || selectedDevices.length === 0}
                                            onClick=${() => this.executeCommand()}>
                                        ${executing ? html`
                                            <span class="spinner-border spinner-border-sm me-2" role="status"></span>
                                            Executing...
                                        ` : html`
                                            <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><circle cx="12" cy="12" r="9" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                                            Execute Command
                                        `}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <!-- Command History -->
                        <div class="col-lg-8">
                            <div class="card">
                                <div class="card-header">
                                    <h3 class="card-title">Command History</h3>
                                    <div class="card-actions">
                                        <button type="button" class="btn btn-sm btn-primary" onClick=${() => this.loadCommands()}>
                                            <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" /><path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" /></svg>
                                            Refresh
                                        </button>
                                    </div>
                                </div>
                                <div class="card-body">
                                    ${commands.length === 0 ? html`
                                        <div class="empty">
                                            <div class="empty-icon">
                                                <svg xmlns="http://www.w3.org/2000/svg" class="icon" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                                            </div>
                                            <p class="empty-title">No commands executed yet</p>
                                            <p class="empty-subtitle text-muted">Execute a command to see it here</p>
                                        </div>
                                    ` : html`
                                        <div class="table-responsive">
                                            <table class="table table-vcenter">
                                                <thead>
                                                    <tr>
                                                        <th>Command</th>
                                                        <th>Devices</th>
                                                        <th>Status</th>
                                                        <th>Executed</th>
                                                        <th class="w-1"></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    ${commands.map(cmd => html`
                                                        <tr>
                                                            <td>
                                                                <div class="font-weight-medium">${cmd.commandType}</div>
                                                                <div class="text-muted small">${cmd.commandId}</div>
                                                            </td>
                                                            <td>
                                                                <span class="badge bg-secondary">${cmd.targetDevices?.length || 0}</span>
                                                            </td>
                                                            <td>
                                                                <span class="badge bg-${this.getCommandStatusBadge(cmd.status)}">${cmd.status}</span>
                                                            </td>
                                                            <td>${new Date(cmd.timestamp).toLocaleString()}</td>
                                                            <td>
                                                                <a href="#!/security/response/${cmd.commandId}" class="btn btn-sm btn-primary">Details</a>
                                                            </td>
                                                        </tr>
                                                    `)}
                                                </tbody>
                                            </table>
                                        </div>
                                    `}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}
