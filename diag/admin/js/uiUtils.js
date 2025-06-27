// uiUtils.js: Shared UI utility functions for the admin dashboard.

/**
 * Creates and manages responsive pagination controls for tables.
 * This function generates a standard pagination UI and handles page clicks.
 *
 * @param {HTMLElement} container - The container element for the pagination controls (e.g., a <ul>).
 * @param {number} totalPages - The total number of pages.
 * @param {function} onPageClick - The callback function to execute when a page link is clicked. It receives the page number as an argument.
 * @param {number} [currentPage=1] - The currently active page.
 */
window.setupPagination = function(container, totalPages, onPageClick, currentPage = 1) {
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
};
