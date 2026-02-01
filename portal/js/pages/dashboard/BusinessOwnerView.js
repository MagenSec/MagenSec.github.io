import { h, Component } from 'preact';

/**
 * BusinessOwnerView - Simplified executive dashboard
 * 
 * Focus: High-level business impact, actionable items
 * - Top 3 priority actions (simplified language)
 * - Compliance status card
 * - License utilization card
 * - Risk summary card
 */
export default class BusinessOwnerView extends Component {
  renderTopActions() {
    const { data } = this.props;
    if (!data?.topActions || data.topActions.length === 0) {
      return (
        <div class="empty">
          <div class="empty-icon">
            <svg class="icon" width="48" height="48" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none">
              <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
              <polyline points="9 11 12 14 20 6" />
              <path d="M20 12v6a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-12a2 2 0 0 1 2 -2h9" />
            </svg>
          </div>
          <p class="empty-title">All clear!</p>
          <p class="empty-subtitle text-muted">No urgent actions required</p>
        </div>
      );
    }

    return (
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Priority Actions</h3>
          <div class="card-actions">
            <span class="badge bg-primary">{data.topActions.length}</span>
          </div>
        </div>
        <div class="list-group list-group-flush">
          {data.topActions.map((action, idx) => (
            <div class="list-group-item" key={idx}>
              <div class="row align-items-center">
                <div class="col-auto">
                  <span class={`badge badge-lg ${this.getUrgencyClass(action.urgency)}`}>
                    {idx + 1}
                  </span>
                </div>
                <div class="col">
                  <div class="font-weight-medium">{action.title}</div>
                  <div class="text-muted small">{action.description}</div>
                  <div class="mt-1">
                    <span class="badge bg-secondary me-1">{action.category}</span>
                    {action.deadline && (
                      <span class="text-muted small">
                        <svg class="icon icon-inline" width="16" height="16" viewBox="0 0 24 24">
                          <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                          <circle cx="12" cy="12" r="9" />
                          <polyline points="12 7 12 12 15 15" />
                        </svg>
                        {action.deadline}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  getUrgencyClass(urgency) {
    const urgencyMap = {
      'Critical': 'bg-danger text-white',
      'High': 'bg-warning text-white',
      'Medium': 'bg-info text-white',
      'Low': 'bg-success text-white'
    };
    return urgencyMap[urgency] || 'bg-secondary text-white';
  }

  renderComplianceCard() {
    const { data } = this.props;
    if (!data?.compliance) return null;

    const comp = data.compliance;
    const statusClass = comp.status === 'Compliant' ? 'success' : 
                       comp.status === 'At Risk' ? 'warning' : 'danger';

    return (
      <div class="card">
        <div class="card-body">
          <div class="d-flex align-items-center mb-3">
            <div class="subheader">Compliance Status</div>
            <div class="ms-auto">
              <span class={`badge bg-${statusClass}`}>{comp.status}</span>
            </div>
          </div>
          <div class="h1 mb-3">{comp.percentage}%</div>
          <div class="progress progress-sm mb-3">
            <div class={`progress-bar bg-${statusClass}`} style={`width: ${comp.percentage}%`}></div>
          </div>
          {comp.gaps > 0 && (
            <div class="text-muted small">
              <svg class="icon icon-inline text-danger" width="16" height="16">
                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                <circle cx="12" cy="12" r="9" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {comp.gaps} compliance gap{comp.gaps !== 1 ? 's' : ''} identified
            </div>
          )}
          {comp.nextReview && (
            <div class="text-muted small mt-1">
              Next review: {comp.nextReview}
            </div>
          )}
        </div>
      </div>
    );
  }

  renderLicenseCard() {
    const { data } = this.props;
    if (!data?.license) return null;

    const lic = data.license;
    const statusClass = lic.status === 'Active' ? 'success' : 
                       lic.status === 'Expiring Soon' ? 'warning' : 'danger';

    return (
      <div class="card">
        <div class="card-body">
          <div class="d-flex align-items-center mb-3">
            <div class="subheader">License Utilization</div>
            <div class="ms-auto">
              <span class={`badge bg-${statusClass}`}>{lic.status}</span>
            </div>
          </div>
          <div class="h1 mb-3">{lic.utilization}%</div>
          <div class="progress progress-sm mb-3">
            <div class={`progress-bar bg-${statusClass}`} style={`width: ${lic.utilization}%`}></div>
          </div>
          <div class="row g-2 text-muted small">
            <div class="col-6">
              <div>Seats Used</div>
              <div class="font-weight-medium text-dark">{lic.seatsUsed} / {lic.totalSeats}</div>
            </div>
            <div class="col-6">
              <div>Days Remaining</div>
              <div class="font-weight-medium text-dark">{lic.daysRemaining}</div>
            </div>
          </div>
          {lic.renewalDate && (
            <div class="text-muted small mt-2">
              Renewal: {lic.renewalDate}
            </div>
          )}
        </div>
      </div>
    );
  }

  renderRiskSummary() {
    const { data } = this.props;
    if (!data?.riskSummary) return null;

    const risk = data.riskSummary;
    const riskClass = risk.overallRisk === 'Critical' ? 'danger' : 
                     risk.overallRisk === 'High' ? 'warning' : 
                     risk.overallRisk === 'Medium' ? 'info' : 'success';

    return (
      <div class="card">
        <div class="card-body">
          <div class="d-flex align-items-center mb-3">
            <div class="subheader">Risk Summary</div>
            <div class="ms-auto">
              <span class={`badge bg-${riskClass}`}>{risk.overallRisk} Risk</span>
            </div>
          </div>
          {risk.topRiskFactors && risk.topRiskFactors.length > 0 && (
            <div class="list-group list-group-flush">
              {risk.topRiskFactors.map((factor, idx) => (
                <div class="list-group-item px-0" key={idx}>
                  <div class="row align-items-center">
                    <div class="col-auto">
                      <svg class="icon text-danger" width="20" height="20">
                        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                        <circle cx="12" cy="12" r="9" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    </div>
                    <div class="col">
                      <div class="font-weight-medium">{factor.factor}</div>
                      <div class="text-muted small">{factor.impact}</div>
                    </div>
                    <div class="col-auto">
                      <span class={`badge ${this.getImpactClass(factor.severity)}`}>
                        {factor.severity}
                      </span>
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

  getImpactClass(severity) {
    const severityMap = {
      'Critical': 'bg-danger text-white',
      'High': 'bg-warning text-white',
      'Medium': 'bg-info text-white',
      'Low': 'bg-success text-white'
    };
    return severityMap[severity] || 'bg-secondary text-white';
  }

  render() {
    const { data } = this.props;
    if (!data) {
      return (
        <div class="alert alert-warning">
          No business owner data available
        </div>
      );
    }

    return (
      <div class="row">
        {/* Left Column - Priority Actions */}
        <div class="col-md-7 mb-3">
          {this.renderTopActions()}
        </div>

        {/* Right Column - Cards */}
        <div class="col-md-5">
          <div class="row">
            <div class="col-12 mb-3">
              {this.renderComplianceCard()}
            </div>
            <div class="col-12 mb-3">
              {this.renderLicenseCard()}
            </div>
            <div class="col-12 mb-3">
              {this.renderRiskSummary()}
            </div>
          </div>
        </div>
      </div>
    );
  }
}
