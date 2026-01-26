/**
 * FilterUtils - Filtering and pagination utilities for SiteAdmin
 * Extracted from SiteAdmin.js
 */

/**
 * Filter organizations by search query and type
 */
export function filterOrgs(orgs, search, typeFilter) {
    return orgs.filter(org => {
        const matchesSearch = !search || 
            org.orgId?.toLowerCase().includes(search.toLowerCase()) ||
            org.orgName?.toLowerCase().includes(search.toLowerCase()) ||
            org.ownerEmail?.toLowerCase().includes(search.toLowerCase());
        
        // Determine if org is personal: use isPersonal if available, fallback to email check
        const isPersonal = org.isPersonal !== undefined 
            ? org.isPersonal 
            : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(org.orgId);
        
        const matchesType = typeFilter === 'All' || 
            (typeFilter === 'Business' && !isPersonal) ||
            (typeFilter === 'Personal' && isPersonal);
        
        return matchesSearch && matchesType;
    });
}

/**
 * Filter accounts by search query
 */
export function filterAccounts(accounts, search) {
    if (!search) return accounts;
    
    const searchLower = search.toLowerCase();
    return accounts.filter(acc => 
        acc.userId?.toLowerCase().includes(searchLower) ||
        acc.email?.toLowerCase().includes(searchLower) ||
        acc.userType?.toLowerCase().includes(searchLower)
    );
}

/**
 * Filter accounts for owner dropdown (only Business Admins and Individuals)
 */
export function filterOwnerAccounts(accounts, search) {
    return accounts.filter(acc => 
        (acc.userType === 'BusinessAdmin' || acc.userType === 'Individual') &&
        (acc.email?.toLowerCase().includes(search.toLowerCase()) ||
         acc.userId?.toLowerCase().includes(search.toLowerCase()))
    );
}

/**
 * Paginate items
 */
export function paginateItems(items, currentPage, itemsPerPage) {
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentItems = items.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(items.length / itemsPerPage);
    
    return {
        currentItems,
        totalPages,
        indexOfFirstItem,
        indexOfLastItem
    };
}
