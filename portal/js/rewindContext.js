/**
 * Rewind Context Manager
 * Enables time-travel: activates a historical date so all supporting API
 * calls automatically append ?date= and the UI shows snapshot data.
 *
 * Usage:
 *   import { rewindContext } from '@rewindContext';
 *   rewindContext.activate('20250101');   // yyyyMMdd
 *   rewindContext.isActive();             // true
 *   rewindContext.getDate();              // '20250101'
 *   const unsubscribe = rewindContext.onChange(date => { ... });
 *   rewindContext.deactivate();
 */

import { logger } from './config.js';

const SESSION_KEY = 'rewindDate';

class RewindContext {
    constructor() {
        this._listeners = [];

        // Restore from sessionStorage so a page refresh preserves context
        const saved = sessionStorage.getItem(SESSION_KEY);
        this._date = saved || null;

        if (this._date) {
            logger.debug('[RewindContext] Restored date from session:', this._date);
        }
    }

    /**
     * Activate rewind mode for a specific date.
     * @param {string} date - yyyyMMdd string (e.g. '20250101')
     */
    activate(date) {
        if (!date || !/^\d{8}$/.test(date)) {
            logger.warn('[RewindContext] activate() called with invalid date:', date);
            return;
        }

        const prev = this._date;
        this._date = date;
        sessionStorage.setItem(SESSION_KEY, date);

        logger.info('[RewindContext] Activated:', date);

        if (prev !== date) {
            this._notify(date);
        }
    }

    /**
     * Deactivate rewind mode; return to live data.
     */
    deactivate() {
        if (!this._date) return;

        this._date = null;
        sessionStorage.removeItem(SESSION_KEY);

        logger.info('[RewindContext] Deactivated');
        this._notify(null);
    }

    /**
     * Returns the active rewind date string (yyyyMMdd) or null if not active.
     */
    getDate() {
        return this._date;
    }

    /**
     * Returns true when rewind mode is active.
     */
    isActive() {
        return this._date !== null;
    }

    /**
     * Subscribe to rewind-date changes.
     * @param {function} callback - Called with date string or null on deactivate.
     * @returns {function} Unsubscribe function.
     */
    onChange(callback) {
        this._listeners.push(callback);
        return () => {
            this._listeners = this._listeners.filter(l => l !== callback);
        };
    }

    /**
     * Returns a human-readable label for the active date (e.g. "Jan 1, 2025").
     */
    getDateLabel() {
        if (!this._date) return null;
        try {
            const y = this._date.slice(0, 4);
            const m = this._date.slice(4, 6);
            const d = this._date.slice(6, 8);
            return new Date(`${y}-${m}-${d}`).toLocaleDateString(undefined, {
                year: 'numeric', month: 'short', day: 'numeric'
            });
        } catch {
            return this._date;
        }
    }

    /**
     * Convert a Date object or ISO string to a yyyyMMdd string.
     * @param {Date|string} date
     * @returns {string}
     */
    toDateKey(date) {
        const d = date instanceof Date ? date : new Date(date);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}${m}${day}`;
    }

    _notify(date) {
        this._listeners.forEach(cb => {
            try {
                cb(date);
            } catch (err) {
                logger.error('[RewindContext] Listener error:', err);
            }
        });

        try {
            window.dispatchEvent(new CustomEvent('rewindChanged', { detail: { date } }));
        } catch (err) {
            logger.error('[RewindContext] Failed to dispatch rewindChanged:', err);
        }
    }
}

export const rewindContext = new RewindContext();
