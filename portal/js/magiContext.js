/**
 * magiContext — page-level grounding for the global Officer MAGI ChatDrawer.
 *
 * Pages that want MAGI's answers grounded in the data the user is currently
 * looking at register a snapshot here. The ChatDrawer reads it on every
 * /ai-analyst/ask call and uses it to seed the opening greeting.
 *
 *   import { magiContext } from '@magiContext';
 *   magiContext.set({
 *       hint: 'patch-status',
 *       greeting: 'Hi — I have your current Patch Status loaded…',
 *       snapshot: { page: 'patch-status', openAlerts: 12, … },
 *       suggestions: ['What should I patch first?', …],
 *   });
 *   // …
 *   magiContext.clear();   // in componentWillUnmount
 */

const _state = {
    hint: null,
    greeting: null,
    snapshot: null,
    suggestions: null,
};
const _listeners = new Set();

function _notify() {
    for (const cb of _listeners) {
        try { cb(_state); } catch (_) { /* ignore listener errors */ }
    }
}

export const magiContext = {
    set(patch) {
        if (!patch || typeof patch !== 'object') return;
        if ('hint' in patch) _state.hint = patch.hint || null;
        if ('greeting' in patch) _state.greeting = patch.greeting || null;
        if ('snapshot' in patch) _state.snapshot = patch.snapshot || null;
        if ('suggestions' in patch) _state.suggestions = Array.isArray(patch.suggestions) ? patch.suggestions : null;
        _notify();
    },
    clear() {
        _state.hint = null;
        _state.greeting = null;
        _state.snapshot = null;
        _state.suggestions = null;
        _notify();
    },
    get() {
        return { ..._state };
    },
    subscribe(cb) {
        if (typeof cb !== 'function') return () => {};
        _listeners.add(cb);
        return () => _listeners.delete(cb);
    },
};

export default magiContext;
