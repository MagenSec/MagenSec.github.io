/**
 * Specs Tab - Hardware, OS, Network, Security specifications
 */
import { formatDate } from '../utils/DateUtils.js';
import { formatNetworkSpeed } from '../utils/FormattingUtils.js';

export function renderSpecsTab(component) {
    const { html } = window;
    const { device, telemetryDetail, showAllIps } = component.state;
    const fields = telemetryDetail?.latest?.fields || {};
    const telemetry = device?.telemetry || device?.Telemetry;

    // Normalize IP addresses to an array for downstream consumers
    const ipRaw = telemetry?.ipAddresses || telemetry?.IPAddresses || fields.IPAddresses;
    const ipAddresses = (() => {
        if (Array.isArray(ipRaw)) return ipRaw;
        if (typeof ipRaw === 'string') {
            try {
                const parsed = JSON.parse(ipRaw);
                if (Array.isArray(parsed)) return parsed;
            } catch (err) { /* fall through to delimiter split */ }
            return ipRaw.split(/[;,\s]+/).filter(Boolean);
        }
        return [];
    })();
    const mobileStatus = component.networkService.detectMobileDevice(telemetryDetail?.history);
    const networkRisk = component.networkService.analyzeNetworkRisk(ipAddresses, telemetryDetail?.history);
    const hasExtraIps = Array.isArray(ipAddresses) && ipAddresses.length > 1;
    const toggleAllIps = (e) => {
        e.preventDefault();
        component.setState({ showAllIps: !showAllIps });
    };

    // Use device object properties for basic info
    const cpuName = device?.cpu || fields.CPUName || 'N/A';
    const cpuCores = device?.cpuCores || fields.CPUCores || 'N/A';
    const architecture = device?.architecture || fields.CPUArch || 'N/A';
    const ramGB = device?.ram ? Math.round(Number(device.ram) / 1024) : (fields.TotalRAMMB ? Math.round(Number(fields.TotalRAMMB) / 1024) : null);
    const diskGB = device?.disk || fields.SystemDriveSizeGB || fields.TotalDiskGb || 'N/A';
    const diskType = fields.SystemDiskMediaType || 'N/A';
    const networkType = fields.ConnectionType || 'N/A';
    const networkSpeed = fields.NetworkSpeedMbps ? formatNetworkSpeed(fields.NetworkSpeedMbps) : '';
    const gpuName = fields.GPUName || 'N/A';
    const gpuRam = fields.GpuRamMB || null;

    const osEdition = device?.os || fields.OSEdition || 'N/A';
    const osVersion = device?.version || fields.OSVersion || 'N/A';
    const osBuild = device?.build || fields.FeaturePackVersion || fields.OSBuild || 'N/A';
    const primaryIp = Array.isArray(ipAddresses) && ipAddresses.length > 0 ? ipAddresses[0] : 'N/A';
    const lastUpdated = telemetry?.timestamp || telemetry?.Timestamp || device?.lastSeen || device?.LastSeen || telemetryDetail?.latest?.timestamp;

    return html`
        <div class="row">
            <div class="col-md-6">
                <h5>Hardware</h5>
                <dl class="row text-sm">
                    <dt class="col-sm-4">CPU</dt>
                    <dd class="col-sm-8">${cpuName} (${cpuCores} cores)</dd>
                    
                    <dt class="col-sm-4">Architecture</dt>
                    <dd class="col-sm-8">${architecture}</dd>
                    
                    <dt class="col-sm-4">RAM</dt>
                    <dd class="col-sm-8">${ramGB ? ramGB + ' GB' : 'N/A'}</dd>
                    
                    <dt class="col-sm-4">Disk</dt>
                    <dd class="col-sm-8">${diskGB} GB (${diskType})</dd>
                    
                    <dt class="col-sm-4">Network</dt>
                    <dd class="col-sm-8">${networkType} ${networkSpeed ? '@ ' + networkSpeed : ''}</dd>
                    
                    <dt class="col-sm-4">GPU</dt>
                    <dd class="col-sm-8">${gpuName} ${gpuRam ? '(' + gpuRam + ' MB)' : ''}</dd>
                </dl>
            </div>
            <div class="col-md-6">
                <h5>Operating System</h5>
                <dl class="row text-sm">
                    <dt class="col-sm-4">Edition</dt>
                    <dd class="col-sm-8">${osEdition}</dd>
                    
                    <dt class="col-sm-4">Version</dt>
                    <dd class="col-sm-8">${osVersion}</dd>
                    
                    <dt class="col-sm-4">Build</dt>
                    <dd class="col-sm-8">${osBuild}</dd>
                    
                    <dt class="col-sm-4">IP Address</dt>
                    <dd class="col-sm-8">
                        ${Array.isArray(ipAddresses) && ipAddresses.length > 0 ? html`
                            ${primaryIp}
                            ${hasExtraIps ? html`
                                <a href="#" class="ms-2 text-primary small" onclick=${toggleAllIps}>
                                    Show all(${ipAddresses.length})
                                </a>
                            ` : ''}
                        ` : 'N/A'}
                    </dd>
                    
                    <dt class="col-sm-4">Last Updated</dt>
                    <dd class="col-sm-8">${lastUpdated ? formatDate(lastUpdated) : 'N/A'}</dd>
                </dl>
            </div>
        </div>
        ${showAllIps && hasExtraIps ? html`
            <div class="row mt-3">
                <div class="col-md-12">
                    <h6>All IP Addresses</h6>
                    <div class="mb-2">
                        ${ipAddresses.map(ip => html`
                            <span class="badge ${component.networkService.isPrivateIp(ip) ? 'bg-success-lt text-success' : 'bg-info-lt text-info'} me-1">${ip}</span>
                        `)}
                    </div>
                </div>
            </div>
        ` : ''}
    `;
}
