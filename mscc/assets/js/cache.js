/**
 * MagenSec Command Center - Cache Management Module
 * Handles client-side data caching, storage, and performance optimization
 */

class CacheManager {
    constructor() {
        this.memoryCache = new Map();
        this.storageKey = 'mscc_cache';
        this.maxMemorySize = 50; // Maximum number of items in memory cache
        this.maxStorageSize = 5 * 1024 * 1024; // 5MB storage limit
        this.defaultTtl = 5 * 60 * 1000; // 5 minutes default TTL
        
        this.init();
    }

    /**
     * Initialize cache manager
     */
    init() {
        try {
            // Load cache from storage
            this.loadFromStorage();
            
            // Set up cleanup interval
            this.startCleanupInterval();
            
            // Set up storage event listener for cross-tab synchronization
            window.addEventListener('storage', this.onStorageChange.bind(this));
            
            console.log('Cache manager initialized successfully');
        } catch (error) {
            console.error('Failed to initialize cache manager:', error);
        }
    }

    /**
     * Store data in cache
     */
    set(key, data, ttl = this.defaultTtl, options = {}) {
        try {
            const item = {
                key,
                data,
                timestamp: Date.now(),
                ttl,
                expires: Date.now() + ttl,
                metadata: {
                    size: this.calculateSize(data),
                    accessed: Date.now(),
                    accessCount: 1,
                    ...options.metadata
                }
            };

            // Store in memory cache
            this.memoryCache.set(key, item);
            
            // Enforce memory cache size limit
            this.enforceMemoryLimit();
            
            // Store in persistent storage if requested
            if (options.persistent !== false) {
                this.saveToStorage();
            }
            
            return true;
        } catch (error) {
            console.error('Failed to cache data:', error);
            return false;
        }
    }

    /**
     * Retrieve data from cache
     */
    get(key, defaultValue = null) {
        try {
            let item = this.memoryCache.get(key);
            
            // If not in memory, try loading from storage
            if (!item) {
                item = this.loadFromStorageByKey(key);
                if (item) {
                    this.memoryCache.set(key, item);
                }
            }
            
            // Check if item exists and is not expired
            if (!item || this.isExpired(item)) {
                if (item) {
                    this.delete(key);
                }
                return defaultValue;
            }
            
            // Update access metadata
            item.metadata.accessed = Date.now();
            item.metadata.accessCount++;
            
            return item.data;
        } catch (error) {
            console.error('Failed to retrieve cached data:', error);
            return defaultValue;
        }
    }

    /**
     * Check if cached item exists and is valid
     */
    has(key) {
        const item = this.memoryCache.get(key) || this.loadFromStorageByKey(key);
        return item && !this.isExpired(item);
    }

    /**
     * Delete item from cache
     */
    delete(key) {
        try {
            this.memoryCache.delete(key);
            this.removeFromStorage(key);
            return true;
        } catch (error) {
            console.error('Failed to delete cached item:', error);
            return false;
        }
    }

    /**
     * Clear all cache data
     */
    clear() {
        try {
            this.memoryCache.clear();
            localStorage.removeItem(this.storageKey);
            return true;
        } catch (error) {
            console.error('Failed to clear cache:', error);
            return false;
        }
    }

    /**
     * Get or set cached data with fallback function
     */
    async getOrSet(key, fallbackFn, ttl = this.defaultTtl, options = {}) {
        try {
            // Try to get from cache first
            let data = this.get(key);
            
            if (data !== null) {
                return data;
            }
            
            // Cache miss - execute fallback function
            data = await fallbackFn();
            
            if (data !== null && data !== undefined) {
                this.set(key, data, ttl, options);
            }
            
            return data;
        } catch (error) {
            console.error('Failed to get or set cached data:', error);
            return null;
        }
    }

    /**
     * Cache API response with automatic key generation
     */
    async cacheApiResponse(endpoint, apiCall, ttl = this.defaultTtl, options = {}) {
        const key = this.generateApiKey(endpoint, options.params);
        return await this.getOrSet(key, apiCall, ttl, {
            ...options,
            metadata: {
                type: 'api_response',
                endpoint,
                ...options.metadata
            }
        });
    }

    /**
     * Invalidate cache entries by pattern
     */
    invalidatePattern(pattern) {
        try {
            const regex = new RegExp(pattern);
            const keysToDelete = [];
            
            // Check memory cache
            for (const key of this.memoryCache.keys()) {
                if (regex.test(key)) {
                    keysToDelete.push(key);
                }
            }
            
            // Check storage cache
            const storageData = this.getStorageData();
            if (storageData) {
                for (const key in storageData) {
                    if (regex.test(key) && !keysToDelete.includes(key)) {
                        keysToDelete.push(key);
                    }
                }
            }
            
            // Delete matched keys
            keysToDelete.forEach(key => this.delete(key));
            
            return keysToDelete.length;
        } catch (error) {
            console.error('Failed to invalidate cache pattern:', error);
            return 0;
        }
    }

    /**
     * Get cache statistics
     */
    getStats() {
        try {
            const memoryItems = Array.from(this.memoryCache.values());
            const storageData = this.getStorageData() || {};
            const storageItems = Object.values(storageData);
            
            const now = Date.now();
            
            return {
                memory: {
                    size: this.memoryCache.size,
                    items: memoryItems.length,
                    totalSize: memoryItems.reduce((sum, item) => sum + (item.metadata?.size || 0), 0),
                    expired: memoryItems.filter(item => this.isExpired(item)).length
                },
                storage: {
                    items: storageItems.length,
                    totalSize: JSON.stringify(storageData).length,
                    expired: storageItems.filter(item => this.isExpired(item)).length
                },
                hitRate: this.calculateHitRate(),
                oldestItem: Math.min(...[...memoryItems, ...storageItems].map(item => item.timestamp)),
                newestItem: Math.max(...[...memoryItems, ...storageItems].map(item => item.timestamp))
            };
        } catch (error) {
            console.error('Failed to get cache stats:', error);
            return null;
        }
    }

    /**
     * Preload frequently accessed data
     */
    async preload(endpoints, options = {}) {
        try {
            const promises = endpoints.map(async (endpoint) => {
                const key = this.generateApiKey(endpoint, options.params);
                
                // Skip if already cached and not expired
                if (this.has(key)) {
                    return;
                }
                
                // Load data if API manager is available
                if (window.apiManager) {
                    try {
                        const data = await window.apiManager.get(endpoint);
                        this.set(key, data, options.ttl, {
                            metadata: { type: 'preloaded', endpoint }
                        });
                    } catch (error) {
                        console.warn(`Failed to preload ${endpoint}:`, error);
                    }
                }
            });
            
            await Promise.allSettled(promises);
            console.log(`Preloaded ${endpoints.length} endpoints`);
        } catch (error) {
            console.error('Failed to preload cache:', error);
        }
    }

    // === Private Methods ===

    /**
     * Check if cache item is expired
     */
    isExpired(item) {
        return Date.now() > item.expires;
    }

    /**
     * Calculate data size for storage management
     */
    calculateSize(data) {
        try {
            return JSON.stringify(data).length;
        } catch (error) {
            return 0;
        }
    }

    /**
     * Generate cache key for API endpoints
     */
    generateApiKey(endpoint, params = {}) {
        const paramString = Object.keys(params).length > 0 
            ? '?' + new URLSearchParams(params).toString()
            : '';
        return `api:${endpoint}${paramString}`;
    }

    /**
     * Enforce memory cache size limits
     */
    enforceMemoryLimit() {
        if (this.memoryCache.size <= this.maxMemorySize) {
            return;
        }
        
        // Convert to array and sort by access patterns
        const items = Array.from(this.memoryCache.entries())
            .map(([key, item]) => ({ key, ...item }))
            .sort((a, b) => {
                // Sort by: expired items first, then by access frequency and recency
                if (this.isExpired(a) && !this.isExpired(b)) return -1;
                if (!this.isExpired(a) && this.isExpired(b)) return 1;
                
                const aScore = a.metadata.accessCount * (Date.now() - a.metadata.accessed);
                const bScore = b.metadata.accessCount * (Date.now() - b.metadata.accessed);
                return bScore - aScore; // Higher score = keep longer
            });
        
        // Remove least important items
        const itemsToRemove = items.slice(0, this.memoryCache.size - this.maxMemorySize);
        itemsToRemove.forEach(item => this.memoryCache.delete(item.key));
    }

    /**
     * Load cache from localStorage
     */
    loadFromStorage() {
        try {
            const data = this.getStorageData();
            if (!data) return;
            
            // Load valid items into memory cache
            Object.entries(data).forEach(([key, item]) => {
                if (!this.isExpired(item)) {
                    this.memoryCache.set(key, item);
                }
            });
            
            // Clean up expired items from storage
            this.cleanupStorage();
        } catch (error) {
            console.error('Failed to load cache from storage:', error);
        }
    }

    /**
     * Load specific item from storage
     */
    loadFromStorageByKey(key) {
        try {
            const data = this.getStorageData();
            return data ? data[key] : null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Save cache to localStorage
     */
    saveToStorage() {
        try {
            const data = this.getStorageData() || {};
            
            // Add memory cache items to storage data
            this.memoryCache.forEach((item, key) => {
                data[key] = item;
            });
            
            // Check storage size limit
            const serialized = JSON.stringify(data);
            if (serialized.length > this.maxStorageSize) {
                this.enforceStorageLimit(data);
                return;
            }
            
            localStorage.setItem(this.storageKey, serialized);
        } catch (error) {
            console.error('Failed to save cache to storage:', error);
        }
    }

    /**
     * Remove item from storage
     */
    removeFromStorage(key) {
        try {
            const data = this.getStorageData();
            if (data && data[key]) {
                delete data[key];
                localStorage.setItem(this.storageKey, JSON.stringify(data));
            }
        } catch (error) {
            console.error('Failed to remove item from storage:', error);
        }
    }

    /**
     * Get storage data
     */
    getStorageData() {
        try {
            const data = localStorage.getItem(this.storageKey);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            return null;
        }
    }

    /**
     * Enforce storage size limits
     */
    enforceStorageLimit(data) {
        try {
            // Sort items by importance (similar to memory cache)
            const items = Object.entries(data)
                .map(([key, item]) => ({ key, ...item }))
                .sort((a, b) => {
                    if (this.isExpired(a) && !this.isExpired(b)) return -1;
                    if (!this.isExpired(a) && this.isExpired(b)) return 1;
                    
                    const aScore = (a.metadata?.accessCount || 1) * (Date.now() - (a.metadata?.accessed || a.timestamp));
                    const bScore = (b.metadata?.accessCount || 1) * (Date.now() - (b.metadata?.accessed || b.timestamp));
                    return bScore - aScore;
                });
            
            // Remove items until under size limit
            const newData = {};
            let currentSize = 0;
            
            for (const item of items) {
                const itemData = { ...item };
                delete itemData.key;
                const itemSize = JSON.stringify(itemData).length;
                
                if (currentSize + itemSize <= this.maxStorageSize) {
                    newData[item.key] = itemData;
                    currentSize += itemSize;
                } else {
                    break;
                }
            }
            
            localStorage.setItem(this.storageKey, JSON.stringify(newData));
        } catch (error) {
            console.error('Failed to enforce storage limit:', error);
        }
    }

    /**
     * Start cleanup interval for expired items
     */
    startCleanupInterval() {
        setInterval(() => {
            this.cleanup();
        }, 60000); // Cleanup every minute
    }

    /**
     * Clean up expired cache items
     */
    cleanup() {
        try {
            // Clean memory cache
            for (const [key, item] of this.memoryCache.entries()) {
                if (this.isExpired(item)) {
                    this.memoryCache.delete(key);
                }
            }
            
            // Clean storage cache
            this.cleanupStorage();
        } catch (error) {
            console.error('Cache cleanup failed:', error);
        }
    }

    /**
     * Clean up expired items from storage
     */
    cleanupStorage() {
        try {
            const data = this.getStorageData();
            if (!data) return;
            
            let hasChanges = false;
            
            Object.keys(data).forEach(key => {
                if (this.isExpired(data[key])) {
                    delete data[key];
                    hasChanges = true;
                }
            });
            
            if (hasChanges) {
                localStorage.setItem(this.storageKey, JSON.stringify(data));
            }
        } catch (error) {
            console.error('Failed to cleanup storage:', error);
        }
    }

    /**
     * Handle storage changes from other tabs
     */
    onStorageChange(event) {
        if (event.key === this.storageKey) {
            this.loadFromStorage();
        }
    }

    /**
     * Calculate cache hit rate
     */
    calculateHitRate() {
        // This would need to be tracked over time
        // For now, return a placeholder
        return 0.75; // 75% hit rate
    }
}

// Create global cache manager instance
window.cacheManager = new CacheManager();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CacheManager;
}
