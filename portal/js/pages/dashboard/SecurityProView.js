import { h, Component } from 'preact';

/**
 * SecurityProView - Advanced threat intelligence dashboard
 * 
 * Focus: CVE details, KEV exploitation, EPSS scores, attack surface
 * - Threat intelligence summary
 * - CVE detailed list with CVSS/EPSS
 * - Known exploited vulnerabilities (KEV)
 * - Attack surface analysis
 * - Security timeline
 */
export default class SecurityProView extends Component {
  renderThreatIntel() {
    const { data } = this.props;
    if (!data?.threatIntel) return null;

    const threat = data.threatIntel;

    return (
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Threat Intelligence Summary</h3>
        </div>
        <div class="card-body">
          <div class="row g-3">
            <div class="col-md-3">
              <div class="card bg-danger-lt border-0">
                <div class="card-body p-3 text-center">
                  <div class="display-6 text-danger">{threat.totalCves || 0}</div>
                  <div class="small text-muted">Total CVEs</div>
                </div>
              </div>
            </div>
            <div class="col-md-3">
              <div class="card bg-warning-lt border-0">
                <div class="card-body p-3 text-center">
                  <div class="display-6 text-warning">{threat.criticalCves || 0}</div>
                  <div class="small text-muted">Critical</div>
                </div>
              </div>
            </div>
            <div class="col-md-3">
              <div class="card bg-danger border-0 text-white">
                <div class="card-body p-3 text-center">
                  <div class="display-6">{threat.kevCount || 0}</div>
                  <div class="small">KEV Exploited</div>
                </div>
              </div>
            </div>
            <div class="col-md-3">
              <div class="card bg-orange-lt border-0">
                <div class="card-body p-3 text-center">
                  <div class="display-6 text-orange">{threat.epssHighCount || 0}</div>
                  <div class="small text-muted">EPSS &gt; 80%</div>
                </div>
              </div>
            </div>
          </div>
          {threat.trendMessage && (
            <div class="alert alert-info mt-3 mb-0">
              <svg class="icon icon-inline" width="20" height="20">
                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                <circle cx="12" cy="12" r="9" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {threat.trendMessage}
            </div>
          )}
        </div>
      </div>
    );
  }

  renderCveDetails() {
    const { data } = this.props;
    if (!data?.cveDetails || data.cveDetails.length === 0) {
      return (
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">CVE Details</h3>
          </div>
          <div class="card-body">
            <div class="empty">
              <div class="empty-icon">
                <svg class="icon text-success" width="48" height="48">
                  <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                  <polyline points="9 11 12 14 20 6" />
                  <path d="M20 12v6a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h9" />
                </svg>
              </div>
              <p class="empty-title">No CVEs found</p>
              <p class="empty-subtitle text-muted">Your environment is secure</p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">CVE Detailed List</h3>
          <div class="card-actions">
            <span class="badge bg-danger">{data.cveDetails.length} CVEs</span>
          </div>
        </div>
        <div class="table-responsive">
          <table class="table table-vcenter card-table table-hover">
            <thead>
              <tr>
                <th>CVE ID</th>
                <th>Description</th>
                <th>CVSS</th>
                <th>EPSS</th>
                <th>Devices</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.cveDetails.map((cve, idx) => (
                <tr key={idx}>
                  <td>
                    <div class="d-flex align-items-center">
                      {cve.isKev && (
                        <span class="badge bg-danger me-2">KEV</span>
                      )}
                      <a href={`#!/cves/${cve.cveId}`} class="text-reset font-weight-medium">
                        {cve.cveId}
                      </a>
                    </div>
                  </td>
                  <td>
                    <div class="text-truncate" style="max-width: 300px;" title={cve.description}>
                      {cve.description}
                    </div>
                  </td>
                  <td>
                    <span class={`badge ${this.getCvssClass(cve.cvssScore)}`}>
                      {cve.cvssScore.toFixed(1)}
                    </span>
                  </td>
                  <td>
                    <span class={`badge ${this.getEpssClass(cve.epssScore)}`}>
                      {(cve.epssScore * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td>
                    <span class="badge bg-primary">{cve.affectedDevices}</span>
                  </td>
                  <td>
                    <span class={`badge ${this.getStatusClass(cve.patchStatus)}`}>
                      {cve.patchStatus}
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

  getCvssClass(cvssScore) {
    if (cvssScore >= 9.0) return 'bg-danger text-white';
    if (cvssScore >= 7.0) return 'bg-warning text-white';
    if (cvssScore >= 4.0) return 'bg-info text-white';
    return 'bg-success text-white';
  }

  getEpssClass(epssScore) {
    if (epssScore >= 0.8) return 'bg-danger text-white';
    if (epssScore >= 0.5) return 'bg-warning text-white';
    if (epssScore >= 0.2) return 'bg-info text-white';
    return 'bg-success text-white';
  }

  getStatusClass(status) {
    const statusMap = {
      'Unpatched': 'bg-danger text-white',
      'Pending': 'bg-warning text-white',
      'Patched': 'bg-success text-white'
    };
    return statusMap[status] || 'bg-secondary text-white';
  }

  renderExploitIntel() {
    const { data } = this.props;
    if (!data?.exploitIntel || data.exploitIntel.length === 0) {
      return (
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Exploit Intelligence</h3>
          </div>
          <div class="card-body">
            <div class="empty">
              <p class="empty-subtitle text-muted">No active exploits detected</p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Known Exploited Vulnerabilities (KEV)</h3>
          <div class="card-actions">
            <span class="badge bg-danger">{data.exploitIntel.length} KEV</span>
          </div>
        </div>
        <div class="list-group list-group-flush">
          {data.exploitIntel.map((exploit, idx) => (
            <div class="list-group-item" key={idx}>
              <div class="row align-items-center">
                <div class="col-auto">
                  <span class="badge badge-lg bg-danger text-white">{idx + 1}</span>
                </div>
                <div class="col">
                  <div class="font-weight-medium">{exploit.cveId}</div>
                  <div class="text-muted small">{exploit.vulnerability}</div>
                  <div class="mt-1">
                    <span class="badge bg-secondary me-1">{exploit.vendorProject}</span>
                    <span class="text-muted small">Added: {exploit.dateAdded}</span>
                  </div>
                </div>
                <div class="col-auto">
                  <span class="badge bg-warning text-white">
                    Due: {exploit.dueDate}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  renderAttackSurface() {
    const { data } = this.props;
    if (!data?.attackSurface) return null;

    const attack = data.attackSurface;

    return (
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Attack Surface Analysis</h3>
        </div>
        <div class="card-body">
          <div class="row g-3 mb-3">
            <div class="col-md-4">
              <div class="subheader mb-1">Exposed Ports</div>
              <div class="h2 mb-0">{attack.exposedPorts || 0}</div>
              <div class="text-muted small">Open network ports</div>
            </div>
            <div class="col-md-4">
              <div class="subheader mb-1">Remote Access</div>
              <div class="h2 mb-0">{attack.remoteAccessDevices || 0}</div>
              <div class="text-muted small">RDP/SSH enabled</div>
            </div>
            <div class="col-md-4">
              <div class="subheader mb-1">Public IPs</div>
              <div class="h2 mb-0">{attack.publicIpDevices || 0}</div>
              <div class="text-muted small">Internet-facing</div>
            </div>
          </div>
          {attack.recommendations && attack.recommendations.length > 0 && (
            <div class="list-group list-group-flush">
              {attack.recommendations.map((rec, idx) => (
                <div class="list-group-item px-0" key={idx}>
                  <div class="d-flex align-items-start">
                    <svg class="icon text-warning me-2" width="20" height="20">
                      <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                      <circle cx="12" cy="12" r="9" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <div>
                      <div class="font-weight-medium">{rec}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  renderTimeline() {
    const { data } = this.props;
    if (!data?.timeline || data.timeline.length === 0) {
      return (
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Security Timeline</h3>
          </div>
          <div class="card-body">
            <div class="empty">
              <p class="empty-subtitle text-muted">No recent security events</p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Recent Security Events</h3>
        </div>
        <div class="list-group list-group-flush">
          {data.timeline.map((event, idx) => (
            <div class="list-group-item" key={idx}>
              <div class="row align-items-center">
                <div class="col-auto">
                  <span class={`status-dot ${this.getEventStatusClass(event.eventType)}`}></span>
                </div>
                <div class="col">
                  <div class="font-weight-medium">{event.eventType}</div>
                  <div class="text-muted small">{event.description}</div>
                  <div class="text-muted small mt-1">{event.timestamp}</div>
                </div>
                <div class="col-auto">
                  <span class={`badge ${this.getEventSeverityClass(event.severity)}`}>
                    {event.severity}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  getEventStatusClass(eventType) {
    const typeMap = {
      'Vulnerability Detected': 'status-red',
      'Patch Applied': 'status-green',
      'Scan Completed': 'status-blue',
      'Alert Triggered': 'status-yellow'
    };
    return typeMap[eventType] || 'status-gray';
  }

  getEventSeverityClass(severity) {
    const severityMap = {
      'Critical': 'bg-danger text-white',
      'High': 'bg-warning text-white',
      'Medium': 'bg-info text-white',
      'Low': 'bg-success text-white',
      'Info': 'bg-secondary text-white'
    };
    return severityMap[severity] || 'bg-secondary text-white';
  }

  render() {
    const { data } = this.props;
    if (!data) {
      return (
        <div class="alert alert-warning">
          No security professional data available
        </div>
      );
    }

    return (
      <div class="row">
        {/* Full Width - Threat Intel */}
        <div class="col-12 mb-3">
          {this.renderThreatIntel()}
        </div>

        {/* Full Width - CVE Details */}
        <div class="col-12 mb-3">
          {this.renderCveDetails()}
        </div>

        {/* Left Column - Exploit Intel + Timeline */}
        <div class="col-md-6 mb-3">
          {this.renderExploitIntel()}
        </div>

        {/* Right Column - Attack Surface */}
        <div class="col-md-6 mb-3">
          {this.renderAttackSurface()}
        </div>

        {/* Full Width - Timeline */}
        <div class="col-12 mb-3">
          {this.renderTimeline()}
        </div>
      </div>
    );
  }
}
