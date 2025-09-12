// MagenSec Hub UI Utilities and Components
class MagenSecUI {
    constructor() {
        this.toastContainer = null;
        this.confirmationModal = null;
        this.loadingOverlay = null;
        this.activeToasts = new Set();
        
        this.initializeComponents();
    }
    
    // ======================
    // Initialization
    // ======================
    
    initializeComponents() {
        // Get references to UI components
        this.toastContainer = document.getElementById('toast-container');
        this.confirmationModal = document.getElementById('confirmation-modal');
        this.loadingOverlay = document.getElementById('loading-overlay');
        
        // Setup modal event listeners
        this.setupModalEvents();
        
        // Setup user menu
        this.setupUserMenu();
        
        // Setup mobile navigation
        this.setupMobileNavigation();
        
        // Setup notifications
        this.setupNotifications();
    }
    
    setupModalEvents() {
        if (!this.confirmationModal) return;
        
        // Close modal when clicking outside
        this.confirmationModal.addEventListener('click', (event) => {
            if (event.target === this.confirmationModal) {
                this.hideConfirmation();
            }
        });
        
        // Setup cancel button
        const cancelBtn = document.getElementById('modal-cancel');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.hideConfirmation());
        }
    }
    
    setupUserMenu() {
        const userMenuBtn = document.getElementById('user-menu-btn');
        const userMenu = document.getElementById('user-menu');
        const logoutBtn = document.getElementById('logout-btn');
        
        if (userMenuBtn && userMenu) {
            userMenuBtn.addEventListener('click', (event) => {
                event.stopPropagation();
                userMenu.classList.toggle('hidden');
            });
            
            // Close menu when clicking outside
            document.addEventListener('click', () => {
                userMenu.classList.add('hidden');
            });
        }
        
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                this.showConfirmation(
                    'Sign Out',
                    'Are you sure you want to sign out?',
                    'Sign Out',
                    'Cancel'
                ).then((confirmed) => {
                    if (confirmed) {
                        window.MagenSecAuth.logout();
                    }
                });
            });
        }
    }
    
    setupMobileNavigation() {
        // Add mobile menu toggle if needed
        const mobileMenuBtn = document.getElementById('mobile-menu-btn');
        const mobileNav = document.getElementById('mobile-nav');
        
        if (mobileMenuBtn && mobileNav) {
            mobileMenuBtn.addEventListener('click', () => {
                mobileNav.classList.toggle('hidden');
            });
        }
    }
    
    setupNotifications() {
        const notificationsBtn = document.getElementById('notifications-btn');
        if (notificationsBtn) {
            notificationsBtn.addEventListener('click', () => {
                this.showNotificationsPanel();
            });
        }
        
        // Periodic notification check
        this.startNotificationPolling();
    }
    
    // ======================
    // Toast Notifications
    // ======================
    
    showToast(message, type = 'info', duration = null) {
        if (!this.toastContainer) return;
        
        const toastId = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const toastDuration = duration || window.MagenSecConfig.ui.toastDuration;
        
        const toast = document.createElement('div');
        toast.id = toastId;
        toast.className = this.getToastClasses(type);
        
        const icon = this.getToastIcon(type);
        toast.innerHTML = `
            <div class="flex items-center">
                <div class="flex-shrink-0">
                    <i class="${icon} text-lg"></i>
                </div>
                <div class="ml-3 flex-1">
                    <p class="text-sm font-medium">${this.escapeHtml(message)}</p>
                </div>
                <div class="ml-4 flex-shrink-0">
                    <button onclick="window.MagenSecUI.hideToast('${toastId}')" 
                            class="inline-flex text-sm hover:opacity-75">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `;
        
        // Add animation classes
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'transform 0.3s ease-in-out';
        
        this.toastContainer.appendChild(toast);
        this.activeToasts.add(toastId);
        
        // Trigger animation
        requestAnimationFrame(() => {
            toast.style.transform = 'translateX(0)';
        });
        
        // Auto-hide after duration
        setTimeout(() => {
            this.hideToast(toastId);
        }, toastDuration);
        
        return toastId;
    }
    
    hideToast(toastId) {
        const toast = document.getElementById(toastId);
        if (!toast) return;
        
        // Animate out
        toast.style.transform = 'translateX(100%)';
        
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
            this.activeToasts.delete(toastId);
        }, 300);
    }
    
    getToastClasses(type) {
        const baseClasses = 'max-w-sm w-full bg-white shadow-lg rounded-lg pointer-events-auto ring-1 ring-black ring-opacity-5 overflow-hidden mb-4 p-4';
        
        const typeClasses = {
            'success': 'border-l-4 border-green-500 text-green-800',
            'error': 'border-l-4 border-red-500 text-red-800',
            'warning': 'border-l-4 border-yellow-500 text-yellow-800',
            'info': 'border-l-4 border-blue-500 text-blue-800'
        };
        
        return `${baseClasses} ${typeClasses[type] || typeClasses.info}`;
    }
    
    getToastIcon(type) {
        const icons = {
            'success': 'fas fa-check-circle text-green-500',
            'error': 'fas fa-exclamation-circle text-red-500',
            'warning': 'fas fa-exclamation-triangle text-yellow-500',
            'info': 'fas fa-info-circle text-blue-500'
        };
        
        return icons[type] || icons.info;
    }
    
    // ======================
    // Loading States
    // ======================
    
    showLoading(message = 'Loading...') {
        if (!this.loadingOverlay) return;
        
        const loadingText = this.loadingOverlay.querySelector('p');
        if (loadingText) {
            loadingText.textContent = message;
        }
        
        this.loadingOverlay.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
    
    hideLoading() {
        if (!this.loadingOverlay) return;
        
        this.loadingOverlay.classList.add('hidden');
        document.body.style.overflow = '';
    }
    
    // ======================
    // Confirmation Modals
    // ======================
    
    showConfirmation(title, message, confirmText = 'Confirm', cancelText = 'Cancel') {
        return new Promise((resolve) => {
            if (!this.confirmationModal) {
                resolve(false);
                return;
            }
            
            // Update modal content
            const modalTitle = document.getElementById('modal-title');
            const modalMessage = document.getElementById('modal-message');
            const modalConfirm = document.getElementById('modal-confirm');
            const modalCancel = document.getElementById('modal-cancel');
            
            if (modalTitle) modalTitle.textContent = title;
            if (modalMessage) modalMessage.textContent = message;
            if (modalConfirm) modalConfirm.textContent = confirmText;
            if (modalCancel) modalCancel.textContent = cancelText;
            
            // Setup event handlers
            const handleConfirm = () => {
                this.hideConfirmation();
                resolve(true);
            };
            
            const handleCancel = () => {
                this.hideConfirmation();
                resolve(false);
            };
            
            // Remove existing listeners
            if (modalConfirm) {
                modalConfirm.replaceWith(modalConfirm.cloneNode(true));
                const newConfirmBtn = document.getElementById('modal-confirm');
                newConfirmBtn.addEventListener('click', handleConfirm);
            }
            
            if (modalCancel) {
                modalCancel.replaceWith(modalCancel.cloneNode(true));
                const newCancelBtn = document.getElementById('modal-cancel');
                newCancelBtn.addEventListener('click', handleCancel);
            }
            
            // Show modal
            this.confirmationModal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
            
            // Focus confirm button
            if (modalConfirm) {
                setTimeout(() => modalConfirm.focus(), 100);
            }
        });
    }
    
    hideConfirmation() {
        if (!this.confirmationModal) return;
        
        this.confirmationModal.classList.add('hidden');
        document.body.style.overflow = '';
    }
    
    // ======================
    // Data Tables
    // ======================
    
    createDataTable(containerId, data, columns, options = {}) {
        const container = document.getElementById(containerId);
        if (!container) return;
        
        const config = {
            pagination: true,
            pageSize: options.pageSize || window.MagenSecConfig.ui.pageSize,
            sortable: true,
            filterable: options.filterable !== false,
            selectable: options.selectable || false,
            actions: options.actions || [],
            emptyMessage: options.emptyMessage || 'No data available',
            ...options
        };
        
        const tableId = `table-${Date.now()}`;
        const table = new DataTable(tableId, data, columns, config);
        
        container.innerHTML = table.render();
        table.initialize();
        
        return table;
    }
    
    // ======================
    // Charts and Graphs
    // ======================
    
    createChart(containerId, type, data, options = {}) {
        // This would integrate with Chart.js or similar library
        const container = document.getElementById(containerId);
        if (!container) return;
        
        // Placeholder for chart implementation
        container.innerHTML = `
            <div class="bg-gray-100 rounded-lg p-8 text-center">
                <i class="fas fa-chart-${type} text-4xl text-gray-400 mb-4"></i>
                <p class="text-gray-600">Chart: ${type}</p>
                <p class="text-sm text-gray-500 mt-2">${data.length} data points</p>
            </div>
        `;
    }
    
    // ======================
    // Form Utilities
    // ======================
    
    validateForm(formId) {
        const form = document.getElementById(formId);
        if (!form) return false;
        
        let isValid = true;
        const errors = [];
        
        // Get all required fields
        const requiredFields = form.querySelectorAll('[required]');
        
        requiredFields.forEach(field => {
            if (!field.value.trim()) {
                isValid = false;
                errors.push(`${this.getFieldLabel(field)} is required`);
                this.showFieldError(field, 'This field is required');
            } else {
                this.clearFieldError(field);
            }
        });
        
        // Email validation
        const emailFields = form.querySelectorAll('input[type="email"]');
        emailFields.forEach(field => {
            if (field.value && !this.isValidEmail(field.value)) {
                isValid = false;
                errors.push(`Please enter a valid email address`);
                this.showFieldError(field, 'Please enter a valid email address');
            }
        });
        
        if (!isValid && errors.length > 0) {
            this.showToast(errors[0], 'error');
        }
        
        return isValid;
    }
    
    showFieldError(field, message) {
        this.clearFieldError(field);
        
        field.classList.add('border-red-500', 'focus:border-red-500');
        
        const errorElement = document.createElement('div');
        errorElement.className = 'field-error text-red-500 text-sm mt-1';
        errorElement.textContent = message;
        
        field.parentNode.insertBefore(errorElement, field.nextSibling);
    }
    
    clearFieldError(field) {
        field.classList.remove('border-red-500', 'focus:border-red-500');
        
        const errorElement = field.parentNode.querySelector('.field-error');
        if (errorElement) {
            errorElement.remove();
        }
    }
    
    getFieldLabel(field) {
        const label = field.parentNode.querySelector('label');
        return label ? label.textContent.replace('*', '').trim() : field.name || 'Field';
    }
    
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
    
    // ======================
    // Utility Functions
    // ======================
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    formatDate(date, format = 'default') {
        if (!date) return '';
        
        const d = new Date(date);
        if (isNaN(d.getTime())) return '';
        
        const formats = {
            'default': { 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            },
            'date-only': { 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric' 
            },
            'time-only': { 
                hour: '2-digit', 
                minute: '2-digit' 
            },
            'relative': null // Will use relative time
        };
        
        if (format === 'relative') {
            return this.getRelativeTime(d);
        }
        
        return d.toLocaleDateString('en-US', formats[format] || formats.default);
    }
    
    getRelativeTime(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffSecs = Math.floor(diffMs / 1000);
        const diffMins = Math.floor(diffSecs / 60);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);
        
        if (diffSecs < 60) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        
        return this.formatDate(date, 'date-only');
    }
    
    formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }
    
    formatNumber(number, notation = 'standard') {
        if (typeof number !== 'number') return '0';
        
        return new Intl.NumberFormat('en-US', {
            notation: notation,
            maximumFractionDigits: 2
        }).format(number);
    }
    
    // ======================
    // Notifications
    // ======================
    
    async startNotificationPolling() {
        // Poll for notifications every 30 seconds
        setInterval(async () => {
            if (window.MagenSecAuth.isAuthenticated()) {
                try {
                    // This would call a real notification endpoint
                    // const notifications = await window.MagenSecAPI.getNotifications();
                    // this.updateNotificationBadge(notifications.unreadCount);
                } catch (error) {
                    // Silent fail for notification polling
                }
            }
        }, 30000);
    }
    
    updateNotificationBadge(count) {
        const badge = document.getElementById('notification-badge');
        if (!badge) return;
        
        if (count > 0) {
            badge.textContent = count > 99 ? '99+' : count.toString();
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
    
    showNotificationsPanel() {
        // Placeholder for notifications panel
        this.showToast('Notifications panel coming soon!', 'info');
    }
    
    // ======================
    // Responsive Utilities
    // ======================
    
    isMobile() {
        return window.innerWidth < 768;
    }
    
    isTablet() {
        return window.innerWidth >= 768 && window.innerWidth < 1024;
    }
    
    isDesktop() {
        return window.innerWidth >= 1024;
    }
}

// Simple DataTable class for displaying tabular data
class DataTable {
    constructor(id, data, columns, config = {}) {
        this.id = id;
        this.data = data;
        this.columns = columns;
        this.config = config;
        this.filteredData = [...data];
        this.currentPage = 1;
        this.sortColumn = null;
        this.sortDirection = 'asc';
        this.selectedRows = new Set();
    }
    
    render() {
        const totalPages = Math.ceil(this.filteredData.length / this.config.pageSize);
        const startIndex = (this.currentPage - 1) * this.config.pageSize;
        const endIndex = startIndex + this.config.pageSize;
        const pageData = this.filteredData.slice(startIndex, endIndex);
        
        return `
            <div class="data-table" id="${this.id}">
                ${this.config.filterable ? this.renderFilters() : ''}
                <div class="overflow-x-auto">
                    <table class="min-w-full bg-white">
                        <thead class="bg-gray-50">
                            ${this.renderHeader()}
                        </thead>
                        <tbody class="divide-y divide-gray-200">
                            ${pageData.length > 0 ? pageData.map(row => this.renderRow(row)).join('') : this.renderEmptyState()}
                        </tbody>
                    </table>
                </div>
                ${this.config.pagination ? this.renderPagination(totalPages) : ''}
            </div>
        `;
    }
    
    renderHeader() {
        return `
            <tr>
                ${this.config.selectable ? '<th class="px-6 py-3 text-left"><input type="checkbox" class="select-all"></th>' : ''}
                ${this.columns.map(col => `
                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${this.config.sortable ? 'cursor-pointer hover:bg-gray-100' : ''}" 
                        ${this.config.sortable ? `data-sort="${col.key}"` : ''}>
                        ${col.label}
                        ${this.config.sortable ? '<i class="fas fa-sort text-gray-400 ml-1"></i>' : ''}
                    </th>
                `).join('')}
                ${this.config.actions.length > 0 ? '<th class="px-6 py-3 text-right">Actions</th>' : ''}
            </tr>
        `;
    }
    
    renderRow(row) {
        return `
            <tr class="hover:bg-gray-50">
                ${this.config.selectable ? `<td class="px-6 py-4"><input type="checkbox" class="row-select" data-id="${row.id}"></td>` : ''}
                ${this.columns.map(col => `
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${this.renderCell(row, col)}
                    </td>
                `).join('')}
                ${this.config.actions.length > 0 ? `<td class="px-6 py-4 text-right">${this.renderActions(row)}</td>` : ''}
            </tr>
        `;
    }
    
    renderCell(row, column) {
        const value = this.getNestedValue(row, column.key);
        
        if (column.render) {
            return column.render(value, row);
        }
        
        if (column.type === 'date') {
            return window.MagenSecUI.formatDate(value, column.format || 'default');
        }
        
        if (column.type === 'number') {
            return window.MagenSecUI.formatNumber(value);
        }
        
        return this.escapeHtml(value?.toString() || '');
    }
    
    renderActions(row) {
        return this.config.actions.map(action => `
            <button class="text-${action.color || 'blue'}-600 hover:text-${action.color || 'blue'}-900 mx-1"
                    onclick="(${action.handler})(${JSON.stringify(row).replace(/"/g, '&quot;')})">
                <i class="${action.icon}"></i>
            </button>
        `).join('');
    }
    
    renderEmptyState() {
        return `
            <tr>
                <td colspan="${this.getTotalColumns()}" class="px-6 py-12 text-center text-gray-500">
                    <i class="fas fa-inbox text-4xl mb-4"></i>
                    <p>${this.config.emptyMessage}</p>
                </td>
            </tr>
        `;
    }
    
    renderFilters() {
        return `
            <div class="mb-4">
                <input type="text" 
                       placeholder="Search..." 
                       class="filter-input w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
            </div>
        `;
    }
    
    renderPagination(totalPages) {
        return `
            <div class="flex items-center justify-between mt-4">
                <div class="text-sm text-gray-700">
                    Showing ${(this.currentPage - 1) * this.config.pageSize + 1} to 
                    ${Math.min(this.currentPage * this.config.pageSize, this.filteredData.length)} of 
                    ${this.filteredData.length} results
                </div>
                <div class="flex space-x-2">
                    <button class="px-3 py-1 border rounded ${this.currentPage === 1 ? 'bg-gray-100 text-gray-400' : 'bg-white hover:bg-gray-50'}"
                            ${this.currentPage === 1 ? 'disabled' : ''} 
                            onclick="window.MagenSecUI.dataTablePrevPage('${this.id}')">
                        Previous
                    </button>
                    <button class="px-3 py-1 border rounded ${this.currentPage === totalPages ? 'bg-gray-100 text-gray-400' : 'bg-white hover:bg-gray-50'}"
                            ${this.currentPage === totalPages ? 'disabled' : ''} 
                            onclick="window.MagenSecUI.dataTableNextPage('${this.id}')">
                        Next
                    </button>
                </div>
            </div>
        `;
    }
    
    initialize() {
        // Setup event listeners for the table
        const table = document.getElementById(this.id);
        if (!table) return;
        
        // Filter input
        const filterInput = table.querySelector('.filter-input');
        if (filterInput) {
            filterInput.addEventListener('input', (e) => {
                this.filter(e.target.value);
            });
        }
        
        // Sort headers
        const sortHeaders = table.querySelectorAll('[data-sort]');
        sortHeaders.forEach(header => {
            header.addEventListener('click', () => {
                this.sort(header.dataset.sort);
            });
        });
        
        // Select all checkbox
        const selectAll = table.querySelector('.select-all');
        if (selectAll) {
            selectAll.addEventListener('change', (e) => {
                this.selectAll(e.target.checked);
            });
        }
    }
    
    filter(query) {
        if (!query) {
            this.filteredData = [...this.data];
        } else {
            const searchTerm = query.toLowerCase();
            this.filteredData = this.data.filter(row => {
                return this.columns.some(col => {
                    const value = this.getNestedValue(row, col.key);
                    return value?.toString().toLowerCase().includes(searchTerm);
                });
            });
        }
        
        this.currentPage = 1;
        this.refresh();
    }
    
    sort(columnKey) {
        if (this.sortColumn === columnKey) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortColumn = columnKey;
            this.sortDirection = 'asc';
        }
        
        this.filteredData.sort((a, b) => {
            const aVal = this.getNestedValue(a, columnKey);
            const bVal = this.getNestedValue(b, columnKey);
            
            if (aVal < bVal) return this.sortDirection === 'asc' ? -1 : 1;
            if (aVal > bVal) return this.sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
        
        this.refresh();
    }
    
    selectAll(checked) {
        const checkboxes = document.querySelectorAll(`#${this.id} .row-select`);
        checkboxes.forEach(checkbox => {
            checkbox.checked = checked;
            if (checked) {
                this.selectedRows.add(checkbox.dataset.id);
            } else {
                this.selectedRows.delete(checkbox.dataset.id);
            }
        });
    }
    
    refresh() {
        const container = document.getElementById(this.id).parentNode;
        container.innerHTML = this.render();
        this.initialize();
    }
    
    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => current?.[key], obj);
    }
    
    getTotalColumns() {
        let count = this.columns.length;
        if (this.config.selectable) count++;
        if (this.config.actions.length > 0) count++;
        return count;
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize global UI instance
window.MagenSecUI = new MagenSecUI();

// Helper functions for DataTable pagination
window.MagenSecUI.dataTablePrevPage = (tableId) => {
    // Implementation would go here
};

window.MagenSecUI.dataTableNextPage = (tableId) => {
    // Implementation would go here
};
