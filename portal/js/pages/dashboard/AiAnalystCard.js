import { h, Component } from 'preact';

/**
 * AiAnalystCard - Always-visible AI security assistant
 * 
 * Features:
 * - Org summary with key metrics
 * - Top security concerns
 * - Suggested natural language queries
 * - Expandable/collapsible interface
 * - Click to navigate to AI chat
 */
export default class AiAnalystCard extends Component {
  handleQueryClick = (query) => {
    // Store suggested query in localStorage for AI chat to pick up
    localStorage.setItem('aiSuggestedQuery', query);
    // Navigate to AI chat page
    window.location.hash = '#!/ai-analyst';
  };

  render() {
    const { data, expanded, onToggle } = this.props;
    
    if (!data) {
      return null;
    }

    return (
      <div class={`card border-primary ${expanded ? '' : 'mb-3'}`} style="border-width: 2px;">
        <div class="card-header bg-primary-lt" style="cursor: pointer;" onClick={onToggle}>
          <div class="row align-items-center">
            <div class="col">
              <h3 class="card-title mb-0">
                <svg class="icon icon-inline me-2" width="24" height="24" viewBox="0 0 24 24">
                  <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                  <circle cx="9" cy="7" r="4" />
                  <path d="M3 21v-2a4 4 0 0 1 4 -4h4a4 4 0 0 1 4 4v2" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  <path d="M21 21v-2a4 4 0 0 0 -3 -3.85" />
                </svg>
                AI Security Analyst
              </h3>
            </div>
            <div class="col-auto">
              <span class="badge bg-primary me-2">Beta</span>
              <svg class={`icon ${expanded ? 'rotate-180' : ''}`} width="24" height="24" style="transition: transform 0.2s;">
                <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </div>
          </div>
        </div>

        {!expanded && (
          <div class="card-body py-2">
            <div class="text-muted small">
              {data.orgSummary || 'AI-powered insights available. Click to expand.'}
            </div>
          </div>
        )}

        {expanded && (
          <div class="card-body">
            {/* Org Summary */}
            {data.orgSummary && (
              <div class="mb-3">
                <div class="subheader mb-2">Organization Summary</div>
                <div class="text-muted">{data.orgSummary}</div>
              </div>
            )}

            {/* Top Concerns */}
            {data.topConcerns && data.topConcerns.length > 0 && (
              <div class="mb-3">
                <div class="subheader mb-2">Top Security Concerns</div>
                <div class="list-group list-group-flush">
                  {data.topConcerns.map((concern, idx) => (
                    <div class="list-group-item px-0 py-2" key={idx}>
                      <div class="row align-items-center">
                        <div class="col-auto">
                          <span class={`badge badge-lg ${this.getConcernBadgeClass(idx)}`}>
                            {idx + 1}
                          </span>
                        </div>
                        <div class="col">
                          <div class="font-weight-medium">{concern}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Suggested Queries */}
            {data.suggestedQueries && data.suggestedQueries.length > 0 && (
              <div class="mb-3">
                <div class="subheader mb-2">Ask the AI Analyst</div>
                <div class="d-flex flex-wrap gap-2">
                  {data.suggestedQueries.map((query, idx) => (
                    <button 
                      key={idx}
                      class="btn btn-outline-primary btn-sm"
                      onClick={() => this.handleQueryClick(query)}
                    >
                      <svg class="icon icon-inline me-1" width="16" height="16">
                        <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                        <circle cx="10" cy="10" r="7" />
                        <line x1="21" y1="21" x2="15" y2="15" />
                      </svg>
                      {query}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Metrics Summary */}
            {data.metricsForAi && (
              <div class="alert alert-info mb-0">
                <div class="row g-2">
                  <div class="col-auto">
                    <svg class="icon icon-inline" width="20" height="20">
                      <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                      <polyline points="3 17 9 11 13 15 21 7" />
                      <polyline points="14 7 21 7 21 14" />
                    </svg>
                  </div>
                  <div class="col">
                    <div class="small">
                      <strong>Context:</strong> {data.metricsForAi.totalDevices} devices · {data.metricsForAi.totalCves} CVEs · {data.metricsForAi.kevCount} KEV exploits · Score {data.metricsForAi.securityScore}/{data.metricsForAi.maxScore}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Action Button */}
            <div class="text-center mt-3">
              <a href="#!/ai-analyst" class="btn btn-primary">
                <svg class="icon icon-inline me-2" width="20" height="20">
                  <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                  <path d="M21 14l-3 -3h-7a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1h9a1 1 0 0 1 1 1v10" />
                  <path d="M14 15v2a1 1 0 0 1 -1 1h-7l-3 3v-10a1 1 0 0 1 1 -1h2" />
                </svg>
                Open AI Security Analyst
              </a>
            </div>
          </div>
        )}
      </div>
    );
  }

  getConcernBadgeClass(idx) {
    const classes = ['bg-danger text-white', 'bg-warning text-white', 'bg-info text-white'];
    return classes[idx] || 'bg-secondary text-white';
  }
}
