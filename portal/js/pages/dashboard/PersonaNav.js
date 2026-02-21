/**
 * PersonaNav - Sticky bottom context lens selector
 *
 * Four context lenses (Business, IT Ops, Security, Auditor).
 * Clicking a lens opens the persona quick-view sheet.
 * Clicking the active lens again closes the sheet (toggling behavior).
 * Features a sliding colored pill indicator that animates between active lenses.
 */
export default class PersonaNav extends Component {
  render() {
    const { activePersona, onPersonaChange } = this.props;

    const { html } = window;

    const PERSONA_GRADIENTS = {
      business: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
      it:       'linear-gradient(135deg, #1d4ed8 0%, #0891b2 100%)',
      security: 'linear-gradient(135deg, #dc2626 0%, #ea580c 100%)',
      auditor:  'linear-gradient(135deg, #0f766e 0%, #047857 100%)'
    };

    const lenses = [
      {
        key: 'business',
        label: 'Business',
        icon: html`<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7v-2a2 2 0 0 1 2 -2h4a2 2 0 0 1 2 2v2" /><line x1="12" y1="12" x2="12" y2="12.01" /><path d="M3 13a20 20 0 0 0 18 0" /></svg>`
      },
      {
        key: 'it',
        label: 'IT Ops',
        icon: html`<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="3" y="4" width="18" height="12" rx="1" /><line x1="7" y1="20" x2="17" y2="20" /><line x1="9" y1="16" x2="9" y2="20" /><line x1="15" y1="16" x2="15" y2="20" /></svg>`
      },
      {
        key: 'security',
        label: 'Security',
        icon: html`<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3" /></svg>`
      },
      {
        key: 'auditor',
        label: 'Auditor',
        icon: html`<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2" /><rect x="9" y="3" width="6" height="4" rx="2" /><path d="M9 12l2 2l4 -4" /></svg>`
      }
    ];

    const activeIndex = Math.max(0, lenses.findIndex(l => l.key === activePersona));
    const activePillGradient = PERSONA_GRADIENTS[activePersona] || PERSONA_GRADIENTS.business;

    return html`
      <div style="
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        z-index: 1030;
        background: var(--tblr-bg-surface, #fff);
        border-top: 1px solid var(--tblr-border-color, #e6e7e9);
        padding: 5px 0 6px;
      ">
        <div class="container" style="max-width: 960px;">
          <div style="position: relative; display: flex; align-items: stretch;">

            <!-- Sliding gradient pill that moves behind active button -->
            <div style="
              position: absolute;
              top: 3px;
              bottom: 3px;
              width: 25%;
              left: ${activeIndex * 25}%;
              border-radius: 10px;
              background: ${activePillGradient};
              transition: left 0.28s cubic-bezier(0.4, 0, 0.2, 1), background 0.28s ease;
              pointer-events: none;
              z-index: 0;
            "></div>

            ${lenses.map((lens, idx) => html`
              <button
                type="button"
                onClick=${() => onPersonaChange(lens.key)}
                title="${lens.label}"
                style="
                  position: relative;
                  z-index: 1;
                  flex: 1;
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  justify-content: center;
                  gap: 2px;
                  background: none;
                  border: none;
                  cursor: pointer;
                  padding: 7px 4px 5px;
                  border-radius: 10px;
                  transition: color 0.2s;
                  color: ${activePersona === lens.key ? '#fff' : 'var(--tblr-secondary, #9ca3af)'};
                "
              >
                ${lens.icon}
                <span style="font-size: 0.68rem; font-weight: ${activePersona === lens.key ? '600' : '400'}; letter-spacing: 0.01em; white-space: nowrap;">
                  ${lens.label}
                </span>
              </button>
            `)}
          </div>
        </div>
      </div>
    `;
  }
}
