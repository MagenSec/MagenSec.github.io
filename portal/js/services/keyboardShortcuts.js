/**
 * Keyboard Shortcuts Service
 * 
 * Provides global keyboard shortcuts for the portal:
 * - Cmd/Ctrl+K: Focus search
 * - Esc: Close modals, clear search
 * - ?: Show keyboard shortcuts help
 * - Arrow keys: Navigate lists
 */

class KeyboardShortcuts {
    constructor() {
        this.shortcuts = new Map();
        this.isInitialized = false;
        this.helpVisible = false;
    }

    initialize() {
        if (this.isInitialized) return;
        
        // Register default shortcuts
        this.registerShortcut('cmd+k', () => this.focusSearch());
        this.registerShortcut('ctrl+k', () => this.focusSearch());
        this.registerShortcut('escape', () => this.handleEscape());
        this.registerShortcut('?', () => this.toggleHelp());
        
        // Listen for keydown events
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        
        this.isInitialized = true;
        console.log('[KeyboardShortcuts] Initialized');
    }

    registerShortcut(key, handler) {
        this.shortcuts.set(key.toLowerCase(), handler);
    }

    handleKeyDown(e) {
        // Don't trigger shortcuts when typing in input fields
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
            // Exception: Allow Esc to clear/blur input
            if (e.key === 'Escape') {
                e.target.blur();
                e.target.value = '';
                return;
            }
            // Exception: Allow Cmd/Ctrl+K to focus search even from inputs
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                this.focusSearch();
                return;
            }
            return;
        }

        // Build shortcut key string
        let shortcut = '';
        if (e.ctrlKey) shortcut += 'ctrl+';
        if (e.metaKey) shortcut += 'cmd+';
        if (e.altKey) shortcut += 'alt+';
        if (e.shiftKey && e.key !== 'Shift') shortcut += 'shift+';
        
        // Add the main key
        if (e.key === 'Escape') {
            shortcut += 'escape';
        } else if (e.key.length === 1) {
            shortcut += e.key.toLowerCase();
        }

        // Execute handler if registered
        const handler = this.shortcuts.get(shortcut);
        if (handler) {
            e.preventDefault();
            handler(e);
        }
    }

    focusSearch() {
        // Try to find search input in current page
        const searchInputs = [
            document.querySelector('#device-search'),
            document.querySelector('#vulnerability-search'),
            document.querySelector('#global-search'),
            document.querySelector('input[type="search"]'),
            document.querySelector('input[placeholder*="Search"]')
        ];

        for (const input of searchInputs) {
            if (input && input.offsetParent !== null) { // Check if visible
                input.focus();
                input.select();
                console.log('[KeyboardShortcuts] Focused search input');
                return;
            }
        }

        console.log('[KeyboardShortcuts] No visible search input found');
    }

    handleEscape() {
        // Close modals
        const modals = document.querySelectorAll('.modal.show');
        if (modals.length > 0) {
            modals.forEach(modal => {
                const bsModal = bootstrap.Modal.getInstance(modal);
                if (bsModal) bsModal.hide();
            });
            console.log('[KeyboardShortcuts] Closed modals');
            return;
        }

        // Close dropdowns
        const dropdowns = document.querySelectorAll('.dropdown-menu.show');
        if (dropdowns.length > 0) {
            dropdowns.forEach(dropdown => {
                dropdown.classList.remove('show');
            });
            console.log('[KeyboardShortcuts] Closed dropdowns');
            return;
        }

        // Clear active filters or search
        const activeFilters = document.querySelectorAll('.filter-active');
        if (activeFilters.length > 0) {
            activeFilters.forEach(filter => filter.classList.remove('filter-active'));
            console.log('[KeyboardShortcuts] Cleared active filters');
            // Trigger filter change event
            window.dispatchEvent(new CustomEvent('filters-cleared'));
            return;
        }

        console.log('[KeyboardShortcuts] Escape pressed (no action taken)');
    }

    toggleHelp() {
        this.helpVisible = !this.helpVisible;
        
        if (this.helpVisible) {
            this.showHelpModal();
        } else {
            this.hideHelpModal();
        }
    }

    showHelpModal() {
        // Check if help modal already exists
        let modal = document.getElementById('keyboard-shortcuts-modal');
        
        if (!modal) {
            // Create help modal
            const modalHtml = `
                <div class="modal fade" id="keyboard-shortcuts-modal" tabindex="-1" aria-labelledby="keyboard-shortcuts-title" aria-hidden="true">
                    <div class="modal-dialog modal-dialog-centered">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title" id="keyboard-shortcuts-title">Keyboard Shortcuts</h5>
                                <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                            </div>
                            <div class="modal-body">
                                <div class="list-group list-group-flush">
                                    <div class="list-group-item">
                                        <div class="row align-items-center">
                                            <div class="col">Focus search</div>
                                            <div class="col-auto">
                                                <kbd>Ctrl</kbd> + <kbd>K</kbd> or <kbd>⌘</kbd> + <kbd>K</kbd>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="list-group-item">
                                        <div class="row align-items-center">
                                            <div class="col">Close modals, clear filters</div>
                                            <div class="col-auto">
                                                <kbd>Esc</kbd>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="list-group-item">
                                        <div class="row align-items-center">
                                            <div class="col">Show this help</div>
                                            <div class="col-auto">
                                                <kbd>?</kbd>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="list-group-item">
                                        <div class="row align-items-center">
                                            <div class="col">Navigate devices</div>
                                            <div class="col-auto">
                                                <kbd>↑</kbd> <kbd>↓</kbd> <kbd>Enter</kbd>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.insertAdjacentHTML('beforeend', modalHtml);
            modal = document.getElementById('keyboard-shortcuts-modal');
        }
        
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
        
        // Reset help visible flag when modal closes
        modal.addEventListener('hidden.bs.modal', () => {
            this.helpVisible = false;
        }, { once: true });
    }

    hideHelpModal() {
        const modal = document.getElementById('keyboard-shortcuts-modal');
        if (modal) {
            const bsModal = bootstrap.Modal.getInstance(modal);
            if (bsModal) bsModal.hide();
        }
    }

    destroy() {
        document.removeEventListener('keydown', this.handleKeyDown);
        this.shortcuts.clear();
        this.isInitialized = false;
    }
}

// Export singleton instance
const keyboardShortcuts = new KeyboardShortcuts();
export default keyboardShortcuts;
