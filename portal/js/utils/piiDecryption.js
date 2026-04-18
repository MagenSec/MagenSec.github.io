/**
 * PII Decryption Helper - Mirror of Common.Security.PiiEncryption.cs
 * 
 * Current Implementation (Phase 1):
 * - De-obfuscates data encrypted with PiiEncryption.EncryptDeterministic()
 * - Algorithm: Remove dashes → Reverse rotation → Base64 decode
 * - Matches Client/EngineLib/Services/SecurityManager.cs encryption
 * 
 * Client Encryption Flow:
 *   SystemInfoProvider → SecurityManager.EncryptPiiDeterministic() → 
 *   PiiEncryption.EncryptDeterministic() → Base64 encode → Rotate → Insert dashes
 */

export class PiiDecryption {
    /**
     * De-obfuscates PII data encrypted with Common.Security.PiiEncryption
     * 
     * Algorithm (matches PiiEncryption.Decrypt):
     * 1. Remove dashes from obfuscated string
     * 2. Reverse rotation (move last 10 chars to beginning)
     * 3. Base64 decode to get original plaintext
     * 
     * Expected format: Base64-rotated string with dashes inserted
     * Example: "UA=-dGRp-bi0x-MjM0LW-Fhc2FwL-XRlc3Q-QVNB" → "ASAP"
     * 
     * @param {string} encryptedData - Obfuscated PII data (with dashes)
     * @returns {string} De-obfuscated plaintext
     */
    static decrypt(encryptedData) {
        if (!encryptedData || typeof encryptedData !== 'string') {
            return encryptedData;
        }

        // Quick check: if it looks like plaintext (has spaces, common words, etc), return as-is
        if (this.looksLikePlaintext(encryptedData)) {
            return encryptedData;
        }

        try {
            // Step 1: Remove dashes (client inserts dashes into rotated base64)
            const withoutDashes = encryptedData.replace(/-/g, '');

            // Step 2: Reverse rotation FIRST.
            // Some rotated payloads may contain '=' padding in the middle (e.g. VQQw==QU-...)
            // which fails strict base64 validation until after rotation is reversed.
            // Mirrors PiiEncryption rotation: base64.Substring(10) + base64.Substring(0, 10)
            const length = withoutDashes.length;
            const unrotatedRaw = length > 10
                ? (withoutDashes.substring(length - 10) + withoutDashes.substring(0, length - 10))
                : withoutDashes;

            // Step 3: Normalize + validate base64 AFTER unrotation
            const unrotated = this.normalizeBase64(unrotatedRaw);
            if (!unrotated) {
                return encryptedData;
            }

            // Step 4: Base64 decode
            const bytes = Uint8Array.from(atob(unrotated), c => c.charCodeAt(0));
            const decrypted = new TextDecoder().decode(bytes);
            
            // Sanity check: decrypted text should be printable ASCII/UTF-8
            if (this.isPrintable(decrypted)) {
                return decrypted;
            }
            
            // If not printable, return original (wasn't actually encrypted)
            return encryptedData;
        } catch (error) {
            console.warn('[PiiDecryption] Decryption failed, returning original:', error);
            return encryptedData;
        }
    }

    /**
     * Normalize a base64 string:
     * - Ensure only base64 chars + '=' padding
     * - Add missing padding if needed
     * @param {string} str
     * @returns {string|null}
     */
    static normalizeBase64(str) {
        if (!str || typeof str !== 'string') return null;

        // Fast reject for obviously non-base64 strings
        if (!/^[A-Za-z0-9+/=]+$/.test(str)) {
            return null;
        }

        // '=' must be at the end (0-2 chars). After unrotation this should hold.
        const padIndex = str.indexOf('=');
        if (padIndex !== -1 && padIndex < str.length - 2) {
            return null;
        }

        // Add missing padding
        const mod = str.length % 4;
        if (mod === 1) {
            // Invalid base64 length
            return null;
        }

        if (mod === 2) return str + '==';
        if (mod === 3) return str + '=';
        return str;
    }

    /**
     * Check if a string looks like plaintext (has spaces, common chars)
     * @param {string} str - String to check
     * @returns {boolean} True if looks like plaintext
     */
    static looksLikePlaintext(str) {
        // If has spaces or common punctuation, likely plaintext
        if (/[\s.,!?@()]/.test(str)) {
            return true;
        }
        
        // If contains common English words
        const commonWords = ['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one', 'our', 'out', 'day'];
        const lower = str.toLowerCase();
        return commonWords.some(word => lower.includes(word));
    }

    /**
     * Check if a string contains printable characters
     * @param {string} str - String to check
     * @returns {boolean} True if printable
     */
    static isPrintable(str) {
        // Check for control characters (except tab, newline, carriage return)
        for (let i = 0; i < str.length; i++) {
            const code = str.charCodeAt(i);
            if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
                return false; // Has unprintable control char
            }
            if (code === 127 || code === 0xFFFD) {
                return false; // DEL or replacement char
            }
        }
        return true;
    }

    /**
     * Decrypt multiple fields in an object
     * @param {Object} data - Object with potentially encrypted fields
     * @param {string[]} fieldNames - Field names to decrypt
     * @returns {Object} Object with decrypted fields
     */
    static decryptFields(data, fieldNames) {
        if (!data || !fieldNames) return data;

        const result = { ...data };
        fieldNames.forEach(field => {
            if (data[field]) {
                try {
                    result[field] = this.decrypt(data[field]);
                } catch (e) {
                    console.warn(`[PiiDecryption] Failed to decrypt field ${field}:`, e);
                    result[field] = data[field]; // Keep original on error
                }
            }
        });
        return result;
    }

    /**
     * Attempt to decrypt a value, return original if fails (safe for already-decrypted data)
     * @param {string} value - Value that might be encrypted
     * @returns {string} Decrypted or original value
     */
    static decryptIfEncrypted(value) {
        if (!value) return value;
        
        // Check if looks encrypted (has dashes in dash-inserted positions)
        if (typeof value === 'string' && (value.includes('-') || value.match(/^[A-Za-z0-9+/]+={0,2}$/))) {
            return this.decrypt(value);
        }
        return value;
    }
}
