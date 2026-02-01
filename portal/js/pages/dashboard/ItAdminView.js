import { h, Component } from 'preact';

/**
 * ItAdminView - Technical operations dashboard
 * 
 * Focus: Device health, app inventory, deployment status
 * - Device health matrix (online/offline/critical)
 * - App risk matrix (vulnerable apps)
 * - Deployment status tracking
 * - Inventory summary
 */
export default class ItAdminView extends Component {
  renderDeviceHealth() {
    const { data } = this.props;
    if (!data?.deviceHealth || data.deviceHealth.length === 0) {
      return (
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Device Health</h3>
          </div>
          <div class="card-body">
            <div class="empty">
              <p class="empty-subtitle text-muted">No device health data available</p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Device Health Matrix</h3>
          <div class="card-actions">
            <span class="badge bg-primary">{data.deviceHealth.length} devices</span>
          </div>
        </div>
        <div class="table-responsive">
          <table class="table table-vcenter card-table table-hover">
            <thead>
              <tr>
                <th>Device</th>
                <th>OS</th>
                <th>Status</th>
                <th>Risk Score</th>
                <th>CVEs</th>
                <th>Last Seen</th>
              </tr>
            </thead>
            <tbody>
              {data.deviceHealth.map((device, idx) => (
                <tr key={idx}>
                  <td>
                    <div class="d-flex align-items-center">
                      <span class={`avatar avatar-sm me-2 ${this.getDeviceAvatarClass(device.osVersion)}`}>
                        {this.getDeviceInitials(device.deviceName)}
                      </span>
                      <div>
                        <div class="font-weight-medium">{device.deviceName}</div>
                        <div class="text-muted small">{device.deviceId}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span class="text-muted">{device.osVersion}</span>
                  </td>
                  <td>
                    <span class={`status-dot ${this.getStatusDotClass(device.status)}`}></span>
                    {device.status}
                  </td>
                  <td>
                    <span class={`badge ${this.getRiskScoreClass(device.riskScore)}`}>
                      {device.riskScore}
                    </span>
                  </td>
                  <td>
                    {device.cveCount > 0 ? (
                      <span class="badge bg-danger">{device.cveCount}</span>
                    ) : (
                      <span class="text-muted">0</span>
                    )}
                  </td>
                  <td>
                    <span class="text-muted small">{device.lastSeen}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  getDeviceInitials(deviceName) {
    if (!deviceName) return '??';
    const parts = deviceName.split('-');
    if (parts.length >= 2) {
      return parts[0].substring(0, 1) + parts[1].substring(0, 1);
    }
    return deviceName.substring(0, 2).toUpperCase();
  }

  getDeviceAvatarClass(osVersion) {
    if (!osVersion) return 'bg-secondary-lt';
    if (osVersion.includes('Windows')) return 'bg-blue-lt';
    if (osVersion.includes('Linux')) return 'bg-orange-lt';
    if (osVersion.includes('Mac')) return 'bg-purple-lt';
    return 'bg-secondary-lt';
  }

  getStatusDotClass(status) {
    const statusMap = {
      'Online': 'status-green status-dot-animated',
      'Stale': 'status-yellow',
      'Offline': 'status-red'
    };
    return statusMap[status] || 'status-gray';
  }

  getRiskScoreClass(riskScore) {
    if (riskScore >= 80) return 'bg-danger text-white';
    if (riskScore >= 60) return 'bg-warning text-white';
    if (riskScore >= 40) return 'bg-info text-white';
    return 'bg-success text-white';
  }

  renderAppRisks() {
    const { data } = this.props;
    if (!data?.appRisks || data.appRisks.length === 0) {
      return (
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Application Risks</h3>
          </div>
          <div class="card-body">
            <div class="empty">
              <p class="empty-subtitle text-muted">No vulnerable applications found</p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Vulnerable Applications</h3>
          <div class="card-actions">
            <span class="badge bg-danger">{data.appRisks.length} apps</span>
          </div>
        </div>
        <div class="table-responsive">
          <table class="table table-vcenter card-table">
            <thead>
              <tr>
                <th>Application</th>
                <th>Version</th>
                <th>Devices Affected</th>
                <th>CVE Count</th>
                <th>Severity</th>
              </tr>
            </thead>
            <tbody>
              {data.appRisks.map((app, idx) => (
                <tr key={idx}>
                  <td>
                    <div class="font-weight-medium">{app.appName}</div>
                    <div class="text-muted small">{app.vendor}</div>
                  </td>
                  <td>
                    <span class="badge bg-danger-lt text-danger">{app.version}</span>
                  </td>
                  <td>
                    <span class="badge bg-primary">{app.affectedDevices} device{app.affectedDevices !== 1 ? 's' : ''}</span>
                  </td>
                  <td>
                    {app.cveCount > 0 ? (
                      <span class="badge bg-danger">{app.cveCount}</span>
                    ) : (
                      <span class="text-muted">0</span>
                    )}
                  </td>
                  <td>
                    <span class={`badge ${this.getSeverityClass(app.maxSeverity)}`}>
                      {app.maxSeverity}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  getSeverityClass(severity) {
    const severityMap = {
      'Critical': 'bg-danger text-white',
      'High': 'bg-warning text-white',
      'Medium': 'bg-info text-white',
      'Low': 'bg-success text-white'
    };
    return severityMap[severity] || 'bg-secondary text-white';
  }

  renderDeploymentStatus() {
    const { data } = this.props;
    if (!data?.deploymentStatus) return null;

    const deploy = data.deploymentStatus;

    return (
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Deployment Status</h3>
        </div>
        <div class="card-body">
          <div class="row mb-3">
            <div class="col-md-6">
              <div class="subheader mb-2">Patch Status</div>
              <div class="progress progress-sm mb-2">
                <div class="progress-bar bg-success" style={`width: ${deploy.patchedPercentage}%`}></div>
              </div>
              <div class="text-muted small">
                {deploy.patchedDevices} / {deploy.totalDevices} devices patched ({deploy.patchedPercentage}%)
              </div>
            </div>
            <div class="col-md-6">
              <div class="subheader mb-2">Update Compliance</div>
              <div class="progress progress-sm mb-2">
                <div class="progress-bar bg-info" style={`width: ${deploy.updateCompliance}%`}></div>
              </div>
              <div class="text-muted small">
                {deploy.updateCompliance}% devices compliant
              </div>
            </div>
          </div>
          {deploy.pendingUpdates > 0 && (
            <div class="alert alert-warning mb-0">
              <svg class="icon icon-inline" width="20" height="20">
                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                <circle cx="12" cy="12" r="9" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {deploy.pendingUpdates} pending update{deploy.pendingUpdates !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      </div>
    );
  }

  renderInventorySummary() {
    const { data } = this.props;
    if (!data?.inventorySummary) return null;

    const inv = data.inventorySummary;

    return (
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Inventory Summary</h3>
        </div>
        <div class="card-body">
          <div class="row g-3">
            <div class="col-md-4">
              <div class="card bg-primary-lt border-0">
                <div class="card-body p-3 text-center">
                  <div class="display-6">{inv.totalApps || 0}</div>
                  <div class="small text-muted">Total Apps</div>
                </div>
              </div>
            </div>
            <div class="col-md-4">
              <div class="card bg-warning-lt border-0">
                <div class="card-body p-3 text-center">
                  <div class="display-6">{inv.vulnerableApps || 0}</div>
                  <div class="small text-muted">Vulnerable</div>
                </div>
              </div>
            </div>
            <div class="col-md-4">
              <div class="card bg-info-lt border-0">
                <div class="card-body p-3 text-center">
                  <div class="display-6">{inv.unmanagedApps || 0}</div>
                  <div class="small text-muted">Unmanaged</div>
                </div>
              </div>
            </div>
          </div>
          {inv.lastScanned && (
            <div class="text-muted small mt-3 text-center">
              Last scanned: {inv.lastScanned}
            </div>
          )}
        </div>
      </div>
    );
  }

  render() {
    const { data } = this.props;
    if (!data) {
      return (
        <div class="alert alert-warning">
          No IT admin data available
        </div>
      );
    }

    return (
      <div class="row">
        {/* Full Width - Device Health */}
        <div class="col-12 mb-3">
          {this.renderDeviceHealth()}
        </div>

        {/* Full Width - App Risks */}
        <div class="col-12 mb-3">
          {this.renderAppRisks()}
        </div>

        {/* Bottom Row - Deployment Status + Inventory */}
        <div class="col-md-6 mb-3">
          {this.renderDeploymentStatus()}
        </div>
        <div class="col-md-6 mb-3">
          {this.renderInventorySummary()}
        </div>
      </div>
    );
  }
}
