/**
 * BulkActionsBar - Bulk device actions component
 * 
 * Displays action bar when devices are selected.
 */

export function renderBulkActionsBar(component) {
    const { html } = window;
    const { selectedDevices } = component.state;
    
    if (selectedDevices.length === 0) return null;
    
    return html`
        <div class="bulk-actions-bar">
            <div class="d-flex align-items-center">
                <div class="me-auto">
                    <strong>${selectedDevices.length}</strong> device${selectedDevices.length > 1 ? 's' : ''} selected
                </div>
                <div class="btn-list">
                    <button class="btn btn-sm btn-primary" onclick=${() => component.scanSelected()}>
                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                            <path d="M20 11a8.1 8.1 0 0 0 -15.5 -2m-.5 -4v4h4" />
                            <path d="M4 13a8.1 8.1 0 0 0 15.5 2m.5 4v-4h-4" />
                        </svg>
                        Scan All
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick=${() => component.exportSelected()}>
                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                            <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2" />
                            <polyline points="7 11 12 16 17 11" />
                            <line x1="12" y1="4" x2="12" y2="16" />
                        </svg>
                        Export
                    </button>
                    <button class="btn btn-sm btn-danger" onclick=${() => component.blockSelected()}>
                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                            <circle cx="12" cy="12" r="9" />
                            <line x1="5.7" y1="5.7" x2="18.3" y2="18.3" />
                        </svg>
                        Block All
                    </button>
                    <button class="btn btn-sm btn-ghost-secondary" onclick=${() => component.clearSelection()}>
                        <svg xmlns="http://www.w3.org/2000/svg" class="icon icon-sm" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round">
                            <path stroke="none" d="M0 0h24v24H0z" fill="none"/>
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    `;
}
