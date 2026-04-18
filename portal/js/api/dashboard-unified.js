/**
 * Unified Dashboard API
 * Handles fetching persona-driven dashboard data
 */

import { apiRequest } from '../utils/api.js';

/**
 * Fetch unified dashboard data for all personas
 * @param {string} orgId - Organization ID
 * @returns {Promise<Object>} Unified dashboard response
 */
export async function getUnifiedDashboard(orgId) {
    try {
        const response = await apiRequest(`/api/v1/orgs/${orgId}/dashboard?format=unified`);
        return response;
    } catch (error) {
        console.error('Failed to fetch unified dashboard:', error);
        throw error;
    }
}

/**
 * Fetch standard dashboard data (backward compatibility)
 * @param {string} orgId - Organization ID
 * @returns {Promise<Object>} Standard dashboard response
 */
export async function getStandardDashboard(orgId) {
    try {
        const response = await apiRequest(`/api/v1/orgs/${orgId}/dashboard`);
        return response;
    } catch (error) {
        console.error('Failed to fetch standard dashboard:', error);
        throw error;
    }
}

/**
 * Send query to AI Security Analyst
 * @param {string} orgId - Organization ID
 * @param {string} query - Natural language query
 * @returns {Promise<Object>} AI response
 */
export async function queryAiAnalyst(orgId, query) {
    try {
        // TODO: Wire to AI endpoint when ready
        const response = await apiRequest(`/api/v1/orgs/${orgId}/ai/query`, {
            method: 'POST',
            body: JSON.stringify({ query })
        });
        return response;
    } catch (error) {
        console.error('Failed to query AI analyst:', error);
        throw error;
    }
}
