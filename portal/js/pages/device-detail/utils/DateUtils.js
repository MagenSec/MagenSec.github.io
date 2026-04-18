/**
 * Date and time formatting utilities
 */

export function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[date.getMonth()]}-${String(date.getDate()).padStart(2, '0')}, ${date.getFullYear()}`;
}

export function formatTime(dateStr) {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatDateTime(dateStr) {
    if (!dateStr) return 'N/A';
    return `${formatDate(dateStr)} ${formatTime(dateStr)}`;
}

export function formatDateRange(startStr, endStr) {
    if (!startStr || !endStr) return 'N/A';
    return `${formatDate(startStr)} – ${formatDate(endStr)}`;
}
