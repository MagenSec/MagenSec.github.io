// telemetryKeyLoader.js
// Loads and decodes the protected telemetry key for the dashboard

async function loadPerfKeyMaterial(filePath, debugDivId = null) {
    let dbg = debugDivId ? document.getElementById(debugDivId) : null;
    // Only show debug if ?debug=1 is present in the URL
    const showDebug = window.location.search.includes('debug=1');
    function logDebug(msg) {
        if (window.__debugLog) window.__debugLog(msg);
        else if (dbg) dbg.innerText += (dbg.innerText ? '\n' : '') + msg;
    }
    if (dbg) {
        dbg.style.display = showDebug ? 'block' : 'none';
        dbg.style.position = 'fixed';
        dbg.style.left = '0';
        dbg.style.right = '0';
        dbg.style.bottom = '0';
        dbg.style.zIndex = '9999';
        dbg.style.margin = '0';
        dbg.style.borderTop = '2px solid #444';
        dbg.style.borderBottom = 'none';
        dbg.style.maxHeight = '30vh';
        dbg.style.overflowY = 'auto';
        if (showDebug) logDebug('Loading and decoding telemetry key...');
    }
    try {
        // Step 1: Fetch the file (assuming it's in the same directory)
        const response = await fetch(filePath);
        if (!response.ok) {
            logDebug('ERROR: Failed to fetch ' + filePath + ' (' + response.status + ')');
            return '';
        }
        const encoded = await response.text();

        // Step 2: Base64 decode the file content
        let decodedOuter;
        try {
            decodedOuter = atob(encoded);
        } catch (e) {
            logDebug('ERROR: atob() failed on file content: ' + e);
            return '';
        }

        // Step 3: Split by newlines (original encoding may have used line breaks)
        const lines = decodedOuter.split(/\r?\n/).filter(Boolean);

        // Step 4: Base64 decode each line to get original 76-char segments
        let decodedChunks = [];
        try {
            decodedChunks = lines.map(line => atob(line));
        } catch (e) {
            logDebug('ERROR: atob() failed on line: ' + e);
            return '';
        }

        // Step 5: Concatenate all chunks
        const concatenated = decodedChunks.join('');
        logDebug('Lines (base64): ' + lines.length + ' lines');
        logDebug('Decoded Chunks (utf8): ' + decodedChunks.join('').slice(0, 100));
        logDebug('Concatenated string length: ' + concatenated.length);
        logDebug('Concatenated preview: ' + concatenated.slice(0, 100));

        // Step 6: Base64 decode the concatenated string to get the original JSON
        let jsonString = '';
        try {
            jsonString = atob(concatenated);
        } catch (e) {
            logDebug('ERROR: atob() failed on concatenated string: ' + e + '\nConcatenated string: ' + concatenated);
            return '';
        }

        // Step 7: Parse JSON and extract SAS URL
        let url = '';
        try {
            const obj = JSON.parse(jsonString);
            url = obj.perfData.uri;
        } catch (e) {
            logDebug('ERROR: JSON.parse() failed: ' + e + '\nRaw JSON: ' + jsonString);
            return '';
        }

        logDebug('Final JSON: ' + jsonString.slice(0, 200));
        logDebug('Final URL: ' + url);
        return url;
    } catch (e) {
        logDebug('UNEXPECTED ERROR: ' + e);
        return '';
    }
}

export { loadPerfKeyMaterial };
