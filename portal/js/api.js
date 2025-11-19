/**
 * API Client - Fetch wrapper with auth
 * No build step - pure vanilla JS
 */

import { auth } from './auth.js';
import { config } from './config.js';

/**
 * Normalize API response to handle both camelCase and PascalCase
 * Also unwraps common envelope patterns: {Success, Data}, {success, data}
 */
function normalizeResponse(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    
    // Handle arrays
    if (Array.isArray(obj)) {
        return obj.map(item => normalizeResponse(item));
    }
    
    // Unwrap common envelope patterns first
    let unwrapped = obj;
    
    // Pattern 1: {Success: bool, Data: {...}, Error: string, Message: string}
    // Pattern 2: {success: bool, data: {...}, error: string, message: string}
    const hasSuccess = 'Success' in obj || 'success' in obj;
    const hasData = 'Data' in obj || 'data' in obj;
    
    if (hasSuccess && hasData) {
        const successVal = obj.Success ?? obj.success;
        const dataVal = obj.Data ?? obj.data;
        const errorVal = obj.Error ?? obj.error;
        const messageVal = obj.Message ?? obj.message;
        
        // Create unwrapped object with normalized keys (lowercase) + original envelope
        unwrapped = {
            success: successVal,
            data: dataVal,
            error: errorVal,
            message: messageVal,
            // Preserve original envelope for backward compat
            Success: successVal,
            Data: dataVal,
            Error: errorVal,
            Message: messageVal
        };
    }
    
    // Create case-insensitive proxy
    const normalized = {};
    const lowerCaseMap = {};
    
    for (const key in unwrapped) {
        const value = unwrapped[key];
        normalized[key] = normalizeResponse(value);
        lowerCaseMap[key.toLowerCase()] = key;
    }
    
    return new Proxy(normalized, {
        get(target, prop) {
            // Direct property exists
            if (prop in target) return target[prop];
            
            // Try lowercase match (camelCase → PascalCase or vice versa)
            const lowerProp = prop.toString().toLowerCase();
            if (lowerProp in lowerCaseMap) {
                return target[lowerCaseMap[lowerProp]];
            }
            
            return undefined;
        },
        has(target, prop) {
            if (prop in target) return true;
            const lowerProp = prop.toString().toLowerCase();
            return lowerProp in lowerCaseMap;
        }
    });
}

export class ApiClient {
    async request(endpoint, options = {}) {
        const url = `${config.API_BASE}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers
        };

        // Add auth token if available
        const token = auth.getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        try {
            const response = await fetch(url, {
                ...options,
                headers
            });

            const data = await response.json();
            
            if (!response.ok) {
                const error = new Error(data.message || data.error || `HTTP ${response.status}: ${response.statusText}`);
                error.status = response.status;
                error.statusText = response.statusText;
                error.response = data;
                throw error;
            }

            // Normalize response to handle both camelCase and PascalCase
            return normalizeResponse(data);
        } catch (error) {
            console.error(`[API] ${endpoint} failed:`, error);
            throw error;
        }
    }

    // Generic GET request
    async get(endpoint, params = null) {
        let url = endpoint;
        if (params) {
            const queryString = new URLSearchParams(params).toString();
            url = `${endpoint}?${queryString}`;
        }
        return this.request(url, { method: 'GET' });
    }

    // Generic POST request
    async post(endpoint, data = null) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }

    // Dashboard data
    async getDashboardData(orgId) {
        return this.get('/api/dashboard', { orgId });
    }

    // Devices for organization
    async getDevices(orgId) {
        return this.get(`/api/orgs/${orgId}/devices`);
    }

    // Stats
    async getStats() {
        return this.request('/portal/api/stats');
    }
}

// Global instance
export const api = new ApiClient();
