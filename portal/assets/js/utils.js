// MagenSec Hub Utility Functions
window.MagenSecUtils = {
    
    // ======================
    // Date and Time Utilities
    // ======================
    
    formatDate(date, format = 'default') {
        if (!date) return 'N/A';
        
        const d = new Date(date);
        if (isNaN(d.getTime())) return 'Invalid Date';
        
        const now = new Date();
        const diffMs = now - d;
        const diffMins = Math.floor(diffMs / (1000 * 60));
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        
        switch (format) {
            case 'relative':
                if (diffMins < 1) return 'Just now';
                if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
                if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
                if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
                if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) !== 1 ? 's' : ''} ago`;
                return d.toLocaleDateString();
                
            case 'short':
                return d.toLocaleDateString();
                
            case 'long':
                return d.toLocaleDateString(undefined, { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                });
                
            case 'time':
                return d.toLocaleTimeString(undefined, { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
                
            case 'datetime':
                return d.toLocaleString();
                
            case 'iso':
                return d.toISOString();
                
            default:
                return d.toLocaleDateString() + ' ' + d.toLocaleTimeString(undefined, { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
        }
    },
    
    parseDate(dateString) {
        if (!dateString) return null;
        
        // Handle various date formats
        const date = new Date(dateString);
        return isNaN(date.getTime()) ? null : date;
    },
    
    // ======================
    // String Utilities
    // ======================
    
    truncate(str, length = 50, suffix = '...') {
        if (!str || str.length <= length) return str || '';
        return str.substring(0, length - suffix.length) + suffix;
    },
    
    capitalize(str) {
        if (!str) return '';
        return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
    },
    
    titleCase(str) {
        if (!str) return '';
        return str.toLowerCase().split(' ').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    },
    
    kebabCase(str) {
        if (!str) return '';
        return str.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`).replace(/^-/, '');
    },
    
    camelCase(str) {
        if (!str) return '';
        return str.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
    },
    
    // ======================
    // Number Utilities
    // ======================
    
    formatNumber(num, options = {}) {
        if (num === null || num === undefined || isNaN(num)) return 'N/A';
        
        const defaults = {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        };
        
        return new Intl.NumberFormat(undefined, { ...defaults, ...options }).format(num);
    },
    
    formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        if (!bytes || isNaN(bytes)) return 'N/A';
        
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
        
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    },
    
    formatPercentage(value, total, decimals = 1) {
        if (!value || !total || total === 0) return '0%';
        return ((value / total) * 100).toFixed(decimals) + '%';
    },
    
    // ======================
    // Object Utilities
    // ======================
    
    deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj.getTime());
        if (obj instanceof Array) return obj.map(item => this.deepClone(item));
        if (typeof obj === 'object') {
            const cloned = {};
            Object.keys(obj).forEach(key => {
                cloned[key] = this.deepClone(obj[key]);
            });
            return cloned;
        }
    },
    
    merge(target, ...sources) {
        if (!sources.length) return target;
        const source = sources.shift();
        
        if (this.isObject(target) && this.isObject(source)) {
            for (const key in source) {
                if (this.isObject(source[key])) {
                    if (!target[key]) Object.assign(target, { [key]: {} });
                    this.merge(target[key], source[key]);
                } else {
                    Object.assign(target, { [key]: source[key] });
                }
            }
        }
        
        return this.merge(target, ...sources);
    },
    
    isObject(item) {
        return item && typeof item === 'object' && !Array.isArray(item);
    },
    
    pick(obj, keys) {
        const result = {};
        keys.forEach(key => {
            if (key in obj) {
                result[key] = obj[key];
            }
        });
        return result;
    },
    
    omit(obj, keys) {
        const result = { ...obj };
        keys.forEach(key => {
            delete result[key];
        });
        return result;
    },
    
    // ======================
    // Array Utilities
    // ======================
    
    unique(array) {
        return [...new Set(array)];
    },
    
    groupBy(array, key) {
        return array.reduce((groups, item) => {
            const group = item[key];
            groups[group] = groups[group] || [];
            groups[group].push(item);
            return groups;
        }, {});
    },
    
    sortBy(array, key, direction = 'asc') {
        return [...array].sort((a, b) => {
            let aVal = a[key];
            let bVal = b[key];
            
            // Handle dates
            if (aVal instanceof Date && bVal instanceof Date) {
                aVal = aVal.getTime();
                bVal = bVal.getTime();
            }
            
            // Handle strings
            if (typeof aVal === 'string' && typeof bVal === 'string') {
                aVal = aVal.toLowerCase();
                bVal = bVal.toLowerCase();
            }
            
            if (aVal < bVal) return direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return direction === 'asc' ? 1 : -1;
            return 0;
        });
    },
    
    chunk(array, size) {
        const chunks = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    },
    
    // ======================
    // URL and Query Utilities
    // ======================
    
    parseQueryString(queryString) {
        const params = {};
        if (!queryString) return params;
        
        queryString.replace(/^\?/, '').split('&').forEach(param => {
            const [key, value] = param.split('=').map(decodeURIComponent);
            if (key) {
                params[key] = value || '';
            }
        });
        
        return params;
    },
    
    buildQueryString(params) {
        const query = Object.entries(params)
            .filter(([key, value]) => value !== null && value !== undefined && value !== '')
            .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
            .join('&');
        
        return query ? '?' + query : '';
    },
    
    getUrlParameter(name) {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get(name);
    },
    
    // ======================
    // Storage Utilities
    // ======================
    
    storage: {
        set(key, value, session = false) {
            try {
                const storage = session ? sessionStorage : localStorage;
                storage.setItem(key, JSON.stringify(value));
                return true;
            } catch (error) {
                console.error('Storage set error:', error);
                return false;
            }
        },
        
        get(key, defaultValue = null, session = false) {
            try {
                const storage = session ? sessionStorage : localStorage;
                const item = storage.getItem(key);
                return item ? JSON.parse(item) : defaultValue;
            } catch (error) {
                console.error('Storage get error:', error);
                return defaultValue;
            }
        },
        
        remove(key, session = false) {
            try {
                const storage = session ? sessionStorage : localStorage;
                storage.removeItem(key);
                return true;
            } catch (error) {
                console.error('Storage remove error:', error);
                return false;
            }
        },
        
        clear(session = false) {
            try {
                const storage = session ? sessionStorage : localStorage;
                storage.clear();
                return true;
            } catch (error) {
                console.error('Storage clear error:', error);
                return false;
            }
        }
    },
    
    // ======================
    // Validation Utilities
    // ======================
    
    validate: {
        email(email) {
            const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            return re.test(email);
        },
        
        phone(phone) {
            const re = /^\+?[\d\s\-\(\)]+$/;
            return re.test(phone) && phone.replace(/\D/g, '').length >= 10;
        },
        
        url(url) {
            try {
                new URL(url);
                return true;
            } catch {
                return false;
            }
        },
        
        ipAddress(ip) {
            const re = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
            return re.test(ip);
        },
        
        required(value) {
            return value !== null && value !== undefined && value !== '';
        },
        
        minLength(value, min) {
            return value && value.length >= min;
        },
        
        maxLength(value, max) {
            return !value || value.length <= max;
        }
    },
    
    // ======================
    // DOM Utilities
    // ======================
    
    dom: {
        createElement(tag, attributes = {}, children = []) {
            const element = document.createElement(tag);
            
            Object.entries(attributes).forEach(([key, value]) => {
                if (key === 'className') {
                    element.className = value;
                } else if (key.startsWith('on')) {
                    element.addEventListener(key.slice(2).toLowerCase(), value);
                } else {
                    element.setAttribute(key, value);
                }
            });
            
            children.forEach(child => {
                if (typeof child === 'string') {
                    element.appendChild(document.createTextNode(child));
                } else if (child instanceof Element) {
                    element.appendChild(child);
                }
            });
            
            return element;
        },
        
        addClass(element, className) {
            if (element && className) {
                element.classList.add(...className.split(' '));
            }
        },
        
        removeClass(element, className) {
            if (element && className) {
                element.classList.remove(...className.split(' '));
            }
        },
        
        toggleClass(element, className) {
            if (element && className) {
                element.classList.toggle(className);
            }
        },
        
        hasClass(element, className) {
            return element && element.classList.contains(className);
        }
    },
    
    // ======================
    // Async Utilities
    // ======================
    
    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },
    
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },
    
    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },
    
    // ======================
    // Error Handling
    // ======================
    
    handleError(error, context = 'Unknown') {
        console.error(`Error in ${context}:`, error);
        
        // Extract meaningful error message
        let message = 'An unexpected error occurred';
        
        if (error.response?.data?.message) {
            message = error.response.data.message;
        } else if (error.message) {
            message = error.message;
        }
        
        return {
            message,
            code: error.response?.status || error.code || 'UNKNOWN',
            context
        };
    },
    
    // ======================
    // Random and ID Generation
    // ======================
    
    generateId(prefix = 'id') {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },
    
    randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    },
    
    randomChoice(array) {
        return array[Math.floor(Math.random() * array.length)];
    }
};
