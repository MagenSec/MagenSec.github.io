/**
 * Manifest Cache Utility
 * Fetches and caches version/installer information from remote manifest
 */

import { logger, config } from '../config.js';

// Use resolved manifest URL from config (avoids CORS issues with short URL redirects)
const MANIFEST_URL = config.MANIFEST_URL;
const CACHE_KEY = 'magensec_manifest_cache';
const CACHE_LIFETIME_MS = 60 * 60 * 1000; // 1 hour

/**
 * Fetch manifest from remote URL
 */
async function fetchManifest() {
    try {
        logger.debug('[ManifestCache] Fetching manifest from:', MANIFEST_URL);
        const response = await fetch(MANIFEST_URL);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        logger.debug('[ManifestCache] Fetched manifest:', data);
        
        return data;
    } catch (error) {
        logger.error('[ManifestCache] Failed to fetch manifest:', error);
        throw error;
    }
}

/**
 * Parse manifest data into installer config format
 */
function parseManifestToInstallerConfig(manifestData) {
    // Support both the legacy `latest.version` manifest shape and the newer
    // `versioned.engine.version` schema used by the installer publish pipeline.
    const latest = manifestData.latest || manifestData;
    const versionedEngine = manifestData.versioned?.engine || {};
    const resolvedVersion = latest.version || versionedEngine.version || manifestData.version || null;
    const packageType = versionedEngine.packageType || (latest.bootstrapper ? 'bootstrapper' : 'bundle');
    const isBootstrapper = packageType === 'bootstrapper' || !!latest.bootstrapper;

    // Note: Bootstrapper is lightweight (1.5MB), downloads Engine+Hub at runtime.
    const estimatedSizeMB = isBootstrapper ? 1.5 : 65.7;
    const installerType = isBootstrapper ? 'Bootstrapper' : 'Bundle';
    const releaseDate = manifestData.releaseDate || versionedEngine.updated || manifestData.manifest?.updated;

    return {
        X64: {
            VERSION: resolvedVersion,
            FILE_SIZE_MB: estimatedSizeMB,
            DOWNLOAD_URL: versionedEngine.x64 || latest.x64 || 'https://magensec.short.gy/x64',
            DISPLAY_NAME: `MagenSec ${installerType} (x64)`,
            DESCRIPTION: isBootstrapper
                ? 'Lightweight installer for 64-bit Windows systems (downloads Engine + Hub at runtime)'
                : 'Complete installer package for 64-bit Windows systems (Engine + Hub)',
            ARCHITECTURE: 'x64',
            WARNING: 'Files are not digitally signed yet and may be flagged by Windows SmartScreen. Click "More info" then "Run anyway" to proceed with installation.',
            RELEASE_DATE: releaseDate,
            RELEASE_NOTES: manifestData.releaseNotes
        },
        ARM64: {
            VERSION: resolvedVersion,
            FILE_SIZE_MB: estimatedSizeMB,
            DOWNLOAD_URL: versionedEngine.arm64 || latest.arm64 || 'https://magensec.short.gy/arm64',
            DISPLAY_NAME: `MagenSec ${installerType} (ARM64)`,
            DESCRIPTION: isBootstrapper
                ? 'Lightweight installer for ARM64 Windows systems (downloads Engine + Hub at runtime)'
                : 'Complete installer package for ARM64 Windows systems (Engine + Hub)',
            ARCHITECTURE: 'ARM64',
            WARNING: 'Files are not digitally signed yet and may be flagged by Windows SmartScreen. Click "More info" then "Run anyway" to proceed with installation.',
            RELEASE_DATE: releaseDate,
            RELEASE_NOTES: manifestData.releaseNotes
        },
        // Legacy reference for version comparison
        ENGINE: {
            VERSION: resolvedVersion
        },
        // Metadata
        _cached: true,
        _cacheTime: Date.now(),
        _manifestUpdated: manifestData.manifest?.updated || versionedEngine.updated || releaseDate
    };
}

/**
 * Get cached manifest if valid
 */
function getCachedManifest() {
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (!cached) {
            logger.debug('[ManifestCache] No cached manifest found');
            return null;
        }
        
        const data = JSON.parse(cached);
        const age = Date.now() - data._cacheTime;
        
        if (age > CACHE_LIFETIME_MS) {
            logger.debug('[ManifestCache] Cached manifest expired (age:', age, 'ms)');
            return null;
        }
        
        logger.debug('[ManifestCache] Using cached manifest (age:', age, 'ms)');
        return data;
    } catch (error) {
        logger.error('[ManifestCache] Error reading cached manifest:', error);
        return null;
    }
}

/**
 * Set cached manifest
 */
function setCachedManifest(config) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(config));
        logger.debug('[ManifestCache] Cached manifest updated');
    } catch (error) {
        logger.error('[ManifestCache] Error caching manifest:', error);
    }
}

/**
 * Clear cached manifest (force refresh)
 */
export function clearManifestCache() {
    try {
        localStorage.removeItem(CACHE_KEY);
        logger.info('[ManifestCache] Cache cleared');
        return true;
    } catch (error) {
        logger.error('[ManifestCache] Error clearing cache:', error);
        return false;
    }
}

/**
 * Get installer config (from cache or remote)
 * @param {boolean} forceRefresh - Skip cache and fetch fresh data
 * @returns {Promise<Object>} Installer configuration
 */
export async function getInstallerConfig(forceRefresh = false) {
    // Prefer the resolved blob manifest URL even in local development.
    // This keeps version metadata current while avoiding short-link redirect issues.
    if (!MANIFEST_URL) {
        logger.warn('[ManifestCache] No manifest URL configured; using fallback installer metadata');
        return null;
    }
    
    // Check cache first (unless force refresh)
    if (!forceRefresh) {
        const cached = getCachedManifest();
        if (cached) {
            return cached;
        }
    } else {
        logger.info('[ManifestCache] Force refresh requested');
    }
    
    // Fetch fresh manifest
    try {
        const manifestData = await fetchManifest();
        const installerConfig = parseManifestToInstallerConfig(manifestData);
        
        // Cache the result
        setCachedManifest(installerConfig);
        
        return installerConfig;
    } catch (error) {
        logger.error('[ManifestCache] Failed to fetch manifest, using fallback config');
        
        // Return fallback config (hardcoded in config.js)
        return null; // Caller should use config.INSTALLERS as fallback
    }
}

/**
 * Get cache status information
 */
export function getCacheStatus() {
    const cached = getCachedManifest();
    if (!cached) {
        return {
            cached: false,
            age: null,
            expires: null
        };
    }
    
    const age = Date.now() - cached._cacheTime;
    const remaining = CACHE_LIFETIME_MS - age;
    
    return {
        cached: true,
        age: Math.floor(age / 1000), // seconds
        expires: Math.floor(remaining / 1000), // seconds
        version: cached.X64.VERSION,
        cacheTime: new Date(cached._cacheTime).toLocaleString()
    };
}
