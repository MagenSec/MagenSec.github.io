/**
 * API Client - Fetch wrapper with auth
 * No build step - pure vanilla JS
 */

import { auth } from './auth.js';
import { config } from './config.js';

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
                throw new Error(data.message || 'API request failed');
            }

            return data;
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
