// js/timeUtils.js
// Provides centralized utility functions for handling time formatting based on user preference.
(function() {
  /**
   * Checks sessionStorage to see if the user prefers local time.
   * Defaults to true (local time) if no setting is found.
   * @returns {boolean} True if local time is preferred, false for UTC.
   */
  function getUseLocalTime() {
    return sessionStorage.getItem('useLocalTime') !== '0'; // Default to local time
  }

  /**
   * Formats a timestamp string into a human-readable format.
   * Respects the user's choice of local time vs. UTC.
   * @param {string} timestamp - The ISO 8601 timestamp string to format.
   * @returns {string} The formatted date-time string.
   */
  function formatTimestamp(timestamp) {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    if (isNaN(date)) return 'Invalid Date';

    const useLocal = getUseLocalTime();

    if (useLocal) {
      // e.g., "6/26/2025, 5:30:00 PM"
      return date.toLocaleString();
    } else {
      // e.g., "2025-06-26 17:30:00 UTC"
      return date.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    }
  }

  /**
   * Formats a timestamp string into a relative time (e.g., '5 minutes ago').
   * @param {string} timestamp - The ISO 8601 timestamp string to format.
   * @returns {string} The relative time string.
   */
  function formatRelativeTime(timestamp) {
    const now = new Date();
    const then = new Date(timestamp);
    const diff = Math.floor((now - then) / 1000);
    if (isNaN(diff)) return timestamp;
    if (diff < 60) return `${diff} seconds ago`;
    if (diff < 3600) return `${Math.floor(diff/60)} minutes ago`;
    if (diff < 86400) return `${Math.floor(diff/3600)} hours ago`;
    return `${Math.floor(diff/86400)} days ago`;
  }

  /**
   * Initializes the timezone toggle button in the header.
   */
  window.initTimezoneToggle = function() {
    const toggleBtn = document.getElementById('timezoneToggle');
    if (!toggleBtn) return;

    const icon = toggleBtn.querySelector('i');

    function updateAppearance() {
      const useLocal = getUseLocalTime();
      if (icon) {
        icon.className = useLocal ? 'ti ti-world-longitude' : 'ti ti-clock';
      }
      const newTitle = useLocal ? 'Switch to UTC Time' : 'Switch to Local Time';
      toggleBtn.setAttribute('data-bs-original-title', newTitle);
      const tooltip = bootstrap.Tooltip.getInstance(toggleBtn);
      if (tooltip) {
        tooltip.setContent({ '.tooltip-inner': newTitle });
      }
    }

    toggleBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const current = getUseLocalTime();
      sessionStorage.setItem('useLocalTime', current ? '0' : '1');
      updateAppearance();

      // Re-render the view to apply the new time format
      if (window.currentViewInit) {
        window.currentViewInit();
      }
    });

    updateAppearance();
  }

  // Expose the utility functions to the global window object
  window.timeUtils = {
    formatTimestamp,
    getUseLocalTime,
    formatRelativeTime
  };

  console.log('timeUtils.js loaded.');
})();
