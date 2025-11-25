/**
 * Toast Notification System using Tabler UI
 */

class ToastManager {
    constructor() {
        this.container = null;
        this.toasts = [];
        this.init();
    }

    init() {
        // Create toast container if it doesn't exist
        if (!document.getElementById('toast-container')) {
            this.container = document.createElement('div');
            this.container.id = 'toast-container';
            this.container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
            this.container.style.zIndex = '9999';
            document.body.appendChild(this.container);
        } else {
            this.container = document.getElementById('toast-container');
        }
    }

    /**
     * Show a toast notification
     * @param {string} message - The message to display
     * @param {string} type - Type of toast: success, error, warning, info
     * @param {number} duration - Duration in milliseconds (0 = no auto-hide)
     */
    show(message, type = 'info', duration = 5000) {
        const toast = this.createToast(message, type);
        this.container.appendChild(toast);

        // Show toast with animation
        setTimeout(() => toast.classList.add('show'), 100);

        // Auto-hide after duration
        if (duration > 0) {
            setTimeout(() => this.hide(toast), duration);
        }

        this.toasts.push(toast);
        return toast;
    }

    createToast(message, type) {
        const toast = document.createElement('div');
        toast.className = `toast align-items-center border-0 ${this.getTypeClass(type)}`;
        toast.setAttribute('role', 'alert');
        toast.setAttribute('aria-live', 'assertive');
        toast.setAttribute('aria-atomic', 'true');

        const icon = this.getIcon(type);

        toast.innerHTML = `
            <div class="d-flex">
                <div class="toast-body">
                    ${icon} ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
        `;

        // Add close button handler
        const closeBtn = toast.querySelector('.btn-close');
        closeBtn.addEventListener('click', () => this.hide(toast));

        return toast;
    }

    getTypeClass(type) {
        const classes = {
            success: 'bg-success text-white',
            error: 'bg-danger text-white',
            warning: 'bg-warning text-white',
            info: 'bg-info text-white'
        };
        return classes[type] || classes.info;
    }

    getIcon(type) {
        const icons = {
            success: '<svg class="icon icon-tabler me-2" width="24" height="24"><use xlink:href="/portal/assets/tabler-icons.svg#tabler-check"/></svg>',
            error: '<svg class="icon icon-tabler me-2" width="24" height="24"><use xlink:href="/portal/assets/tabler-icons.svg#tabler-alert-circle"/></svg>',
            warning: '<svg class="icon icon-tabler me-2" width="24" height="24"><use xlink:href="/portal/assets/tabler-icons.svg#tabler-alert-triangle"/></svg>',
            info: '<svg class="icon icon-tabler me-2" width="24" height="24"><use xlink:href="/portal/assets/tabler-icons.svg#tabler-info-circle"/></svg>'
        };
        return icons[type] || icons.info;
    }

    hide(toast) {
        toast.classList.remove('show');
        setTimeout(() => {
            toast.remove();
            this.toasts = this.toasts.filter(t => t !== toast);
        }, 300);
    }

    // Convenience methods
    success(message, duration = 5000) {
        return this.show(message, 'success', duration);
    }

    error(message, duration = 7000) {
        return this.show(message, 'error', duration);
    }

    warning(message, duration = 6000) {
        return this.show(message, 'warning', duration);
    }

    info(message, duration = 5000) {
        return this.show(message, 'info', duration);
    }

    clearAll() {
        this.toasts.forEach(toast => this.hide(toast));
        this.toasts = [];
    }
}

// Create global toast manager instance
window.toast = new ToastManager();

export default window.toast;
