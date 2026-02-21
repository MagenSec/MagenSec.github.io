/**
 * PersonaNav - Sticky bottom persona navigation
 *
 * Features:
 * - Sticky bottom positioning
 * - Four persona pills (Business Owner, IT Admin, Security Pro, Auditor)
 * - Active state highlighting
 * - Smooth transitions
 * - Responsive design
 */
export default class PersonaNav extends Component {
  render() {
    const { activePersona, onPersonaChange } = this.props;

    const { html } = window;

    return html`
      <div class="persona-nav-sticky">
        <div class="container-fluid">
          <div class="card shadow-lg">
            <div class="card-body p-3">
              <div class="row align-items-center">
                <div class="col-auto">
                  <span class="text-muted small">View as:</span>
                </div>
                <div class="col">
                  <div class="btn-group w-100" role="group">
                    <button
                      type="button"
                      class="btn ${activePersona === 'business' ? 'btn-primary' : 'btn-outline-primary'}"
                      onClick=${() => onPersonaChange('business')}
                    >
                      <svg class="icon icon-inline me-1" width="20" height="20" viewBox="0 0 24 24">
                        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                        <rect x="3" y="4" width="18" height="4" rx="2" />
                        <path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-10" />
                        <line x1="10" y1="12" x2="14" y2="12" />
                      </svg>
                      <span class="d-none d-sm-inline">Business Owner</span>
                      <span class="d-inline d-sm-none">Business</span>
                    </button>

                    <button
                      type="button"
                      class="btn ${activePersona === 'it' ? 'btn-primary' : 'btn-outline-primary'}"
                      onClick=${() => onPersonaChange('it')}
                    >
                      <svg class="icon icon-inline me-1" width="20" height="20" viewBox="0 0 24 24">
                        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                        <rect x="3" y="4" width="18" height="12" rx="1" />
                        <line x1="7" y1="20" x2="17" y2="20" />
                        <line x1="9" y1="16" x2="9" y2="20" />
                        <line x1="15" y1="16" x2="15" y2="20" />
                      </svg>
                      <span class="d-none d-sm-inline">IT Admin</span>
                      <span class="d-inline d-sm-none">IT</span>
                    </button>

                    <button
                      type="button"
                      class="btn ${activePersona === 'security' ? 'btn-primary' : 'btn-outline-primary'}"
                      onClick=${() => onPersonaChange('security')}
                    >
                      <svg class="icon icon-inline me-1" width="20" height="20" viewBox="0 0 24 24">
                        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                        <path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3" />
                      </svg>
                      <span class="d-none d-sm-inline">Security Pro</span>
                      <span class="d-inline d-sm-none">Security</span>
                    </button>

                    <button
                      type="button"
                      class="btn ${activePersona === 'auditor' ? 'btn-primary' : 'btn-outline-primary'}"
                      onClick=${() => onPersonaChange('auditor')}
                    >
                      <svg class="icon icon-inline me-1" width="20" height="20" viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path stroke="none" d="M0 0h24v24H0z" fill="none" />
                        <path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2" />
                        <rect x="9" y="3" width="6" height="4" rx="2" />
                        <path d="M9 12l2 2l4 -4" />
                      </svg>
                      <span class="d-none d-sm-inline">Auditor</span>
                      <span class="d-inline d-sm-none">Audit</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}
