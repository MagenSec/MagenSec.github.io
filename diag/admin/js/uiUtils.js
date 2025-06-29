// uiUtils.js: Shared UI utility functions for the admin dashboard.

/* global Tabler */
// uiUtils.js
console.log('uiUtils.js loaded');

window.uiUtils = {
    /**
     * Creates and shows a dynamic Bootstrap 5 modal.
     * @param {object} options - The options for the modal.
     * @param {string} options.id - The ID for the modal element.
     * @param {string} options.title - The title of the modal.
     * @param {string} options.body - The HTML content for the modal body.
     * @param {string} [options.footer] - The HTML content for the modal footer. If not provided, a default close button is used.
     * @param {'modal-sm'|'modal-lg'|'modal-xl'} [options.size] - The size of the modal.
     */
    showModal: (options) => {
        // Remove any existing modal with the same ID
        const existingModal = document.getElementById(options.id);
        if (existingModal) {
            existingModal.remove();
        }

        // Create modal element
        const modalEl = document.createElement('div');
        modalEl.className = 'modal fade';
        modalEl.id = options.id;
        modalEl.tabIndex = -1;
        modalEl.setAttribute('aria-hidden', 'true');

        const modalDialogClasses = ['modal-dialog', 'modal-dialog-centered', 'modal-dialog-scrollable'];
        if (options.size) {
            modalDialogClasses.push(options.size);
        }

        modalEl.innerHTML = `
            <div class="${modalDialogClasses.join(' ')}" role="document">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">${options.title}</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        ${options.body}
                    </div>
                    ${options.footer ? `<div class="modal-footer">${options.footer}</div>` : ''}
                </div>
            </div>
        `;

        document.body.appendChild(modalEl);

        // Use Bootstrap modal directly instead of Tabler wrapper
        let modalInstance;
        if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
            modalInstance = new bootstrap.Modal(modalEl);
        } else if (typeof Tabler !== 'undefined' && Tabler.Modal) {
            modalInstance = new Tabler.Modal(modalEl);
        } else {
            // Fallback: manually trigger the modal
            modalEl.classList.add('show');
            modalEl.style.display = 'block';
            document.body.classList.add('modal-open');
        }

        if (modalInstance && modalInstance.show) {
            modalInstance.show();
        }

        // Cleanup on hide
        modalEl.addEventListener('hidden.bs.modal', () => {
            if (document.body.contains(modalEl)) {
                document.body.removeChild(modalEl);
            }
        });

        // Add close button functionality for fallback case
        const closeButton = modalEl.querySelector('[data-bs-dismiss="modal"]');
        if (closeButton) {
            closeButton.addEventListener('click', () => {
                if (modalInstance && modalInstance.hide) {
                    modalInstance.hide();
                } else {
                    // Fallback manual close
                    modalEl.classList.remove('show');
                    modalEl.style.display = 'none';
                    document.body.classList.remove('modal-open');
                    if (document.body.contains(modalEl)) {
                        document.body.removeChild(modalEl);
                    }
                }
            });
        }
    },

    /**
     * Creates and manages responsive pagination controls for tables.
     * This function generates a standard pagination UI and handles page clicks.
     *
     * @param {HTMLElement} container - The container element for the pagination controls (e.g., a <ul>).
     * @param {number} totalPages - The total number of pages.
     * @param {function} onPageClick - The callback function to execute when a page link is clicked. It receives the page number as an argument.
     * @param {number} [currentPage=1] - The currently active page.
     */
    setupPagination: function(container, totalPages, onPageClick, currentPage = 1) {
        if (!container) {
            console.error("Pagination container not found.");
            return;
        }
        container.innerHTML = ''; // Clear existing pagination

        if (totalPages <= 1) {
            return; // No pagination needed for a single page
        }

        // Helper to create a single page item
        const createPageItem = (page, text, isActive = false, isDisabled = false) => {
            const li = document.createElement('li');
            li.className = `page-item ${isActive ? 'active' : ''} ${isDisabled ? 'disabled' : ''}`;
            
            const a = document.createElement('a');
            a.className = 'page-link';
            a.href = '#';
            a.dataset.page = page;
            a.innerHTML = text;
            if (isDisabled) {
                a.tabIndex = -1;
                a.setAttribute('aria-disabled', 'true');
            }
            
            li.appendChild(a);
            return li;
        };

        // --- Build Pagination ---
        // Previous Button
        container.appendChild(createPageItem(currentPage - 1, '<i class="ti ti-chevron-left"></i>', false, currentPage === 1));

        // Page Number Logic (to avoid showing all pages if there are many)
        const maxVisiblePages = 7;
        let startPage, endPage;

        if (totalPages <= maxVisiblePages) {
            startPage = 1;
            endPage = totalPages;
        } else {
            const maxPagesBeforeCurrent = Math.floor((maxVisiblePages - 3) / 2);
            const maxPagesAfterCurrent = Math.ceil((maxVisiblePages - 3) / 2);

            if (currentPage <= maxPagesBeforeCurrent + 1) {
                startPage = 1;
                endPage = maxVisiblePages - 2;
            } else if (currentPage + maxPagesAfterCurrent >= totalPages) {
                startPage = totalPages - maxVisiblePages + 3;
                endPage = totalPages;
            } else {
                startPage = currentPage - maxPagesBeforeCurrent;
                endPage = currentPage + maxPagesAfterCurrent;
            }
        }

        // "First" page and ellipsis if needed
        if (startPage > 1) {
            container.appendChild(createPageItem(1, '1'));
            if (startPage > 2) {
                container.appendChild(createPageItem(0, '...', false, true));
            }
        }

        // Render page numbers
        for (let i = startPage; i <= endPage; i++) {
            container.appendChild(createPageItem(i, i, i === currentPage));
        }

        // "Last" page and ellipsis if needed
        if (endPage < totalPages) {
            if (endPage < totalPages - 1) {
                container.appendChild(createPageItem(0, '...', false, true));
            }
            container.appendChild(createPageItem(totalPages, totalPages));
        }

        // Next Button
        container.appendChild(createPageItem(currentPage + 1, '<i class="ti ti-chevron-right"></i>', false, currentPage === totalPages));

        // --- Event Listener ---
        // Use a single listener on the container for efficiency
        container.addEventListener('click', (e) => {
            e.preventDefault();
            const target = e.target.closest('a.page-link');
            
            // Check if the clicked link is valid, not disabled, and not the active page
            if (target && !target.parentElement.classList.contains('disabled') && !target.parentElement.classList.contains('active')) {
                const page = parseInt(target.dataset.page, 10);
                if (page) { // page will be 0 for ellipsis, so this check is sufficient
                    onPageClick(page);
                }
            }
        });
    }
};
