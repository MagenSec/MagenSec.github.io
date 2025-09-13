/**
 * Template Utilities
 * 
 * Provides utilities for working with HTML templates including
 * dynamic content interpolation and template management.
 */

// Make template utilities available globally
window.MagenSecTemplateUtils = window.MagenSecTemplateUtils || {};

/**
 * Simple template interpolation utility
 * Replaces {{variableName}} placeholders with actual values
 * 
 * @param {string} template - HTML template string with placeholders
 * @param {Object} data - Data object with values to interpolate
 * @returns {string} - Template with values interpolated
 */
window.MagenSecTemplateUtils.interpolate = function(template, data = {}) {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return data.hasOwnProperty(key) ? data[key] : match;
    });
};

/**
 * Create DOM element from template string
 * 
 * @param {string} template - HTML template string
 * @param {Object} data - Optional data for interpolation
 * @returns {DocumentFragment} - DOM fragment ready for insertion
 */
window.MagenSecTemplateUtils.createElement = function(template, data = {}) {
    const interpolated = this.interpolate(template, data);
    const templateElement = document.createElement('template');
    templateElement.innerHTML = interpolated.trim();
    return templateElement.content;
};

/**
 * Insert template into DOM
 * 
 * @param {Element} container - Container element
 * @param {string} template - HTML template string
 * @param {Object} data - Optional data for interpolation
 * @param {string} position - Where to insert ('beforeend', 'afterbegin', etc.)
 */
window.MagenSecTemplateUtils.insertTemplate = function(container, template, data = {}, position = 'beforeend') {
    const interpolated = this.interpolate(template, data);
    container.insertAdjacentHTML(position, interpolated);
};

/**
 * Replace container content with template
 * 
 * @param {Element} container - Container element
 * @param {string} template - HTML template string
 * @param {Object} data - Optional data for interpolation
 */
window.MagenSecTemplateUtils.replaceWith = function(container, template, data = {}) {
    const interpolated = this.interpolate(template, data);
    container.innerHTML = interpolated;
};

/**
 * Find and remove elements matching selector
 * Useful for cleaning up dynamically created templates
 * 
 * @param {string} selector - CSS selector
 * @param {Element} context - Optional context element (defaults to document)
 */
window.MagenSecTemplateUtils.remove = function(selector, context = document) {
    const elements = context.querySelectorAll(selector);
    elements.forEach(element => element.remove());
};

/**
 * Template cache for loaded templates
 * Prevents multiple fetch requests for the same template
 */
const templateCache = new Map();

/**
 * Load template from external file (future enhancement)
 * 
 * @param {string} templatePath - Path to template file
 * @returns {Promise<string>} - Template content
 */
export async function loadTemplate(templatePath) {
    if (templateCache.has(templatePath)) {
        return templateCache.get(templatePath);
    }
    
    try {
        const response = await fetch(`/portal/assets/js/templates/${templatePath}.html`);
        if (!response.ok) {
            throw new Error(`Failed to load template: ${templatePath}`);
        }
        
        const template = await response.text();
        templateCache.set(templatePath, template);
        return template;
    } catch (error) {
        console.error('Template loading error:', error);
        throw error;
    }
}

/**
 * Clear template cache
 * Useful for development or when templates are updated
 */
export function clearTemplateCache() {
    templateCache.clear();
}