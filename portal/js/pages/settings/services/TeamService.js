/**
 * TeamService - Team member management utilities
 * Extracted from Settings.js
 */

/**
 * Validate email format
 */
export function isValidEmail(email) {
    if (!email || typeof email !== 'string') {
        return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Get role badge class
 */
export function getRoleBadgeClass(role) {
    switch (role) {
        case 'Owner':
            return 'bg-primary';
        case 'ReadWrite':
            return 'bg-success';
        case 'ReadOnly':
            return 'bg-info';
        default:
            return 'bg-secondary';
    }
}

/**
 * Get role display name
 */
export function getRoleDisplayName(role) {
    switch (role) {
        case 'Owner':
            return 'Owner';
        case 'ReadWrite':
            return 'Read/Write';
        case 'ReadOnly':
            return 'Read-Only';
        default:
            return role || 'Unknown';
    }
}

/**
 * Format member for display
 */
export function formatMemberDisplay(member) {
    if (!member) return null;
    
    return {
        email: member.email || member.userEmail,
        role: member.role || member.memberRole || 'ReadOnly',
        joinedAt: member.joinedAt || member.createdAt,
        lastActive: member.lastActive || member.lastSeen,
        displayName: member.displayName || member.name || member.email,
        roleBadgeClass: getRoleBadgeClass(member.role),
        roleDisplayName: getRoleDisplayName(member.role)
    };
}

/**
 * Filter members by search query
 */
export function filterMembers(members, searchQuery) {
    if (!searchQuery || searchQuery.trim() === '') {
        return members;
    }
    
    const query = searchQuery.toLowerCase();
    return members.filter(member => {
        const email = (member.email || '').toLowerCase();
        const displayName = (member.displayName || member.name || '').toLowerCase();
        const role = (member.role || '').toLowerCase();
        
        return email.includes(query) || 
               displayName.includes(query) || 
               role.includes(query);
    });
}

/**
 * Sort members by role priority (Owner → ReadWrite → ReadOnly)
 */
export function sortMembersByRole(members) {
    const rolePriority = { 'Owner': 0, 'ReadWrite': 1, 'ReadOnly': 2 };
    
    return [...members].sort((a, b) => {
        const priorityA = rolePriority[a.role] ?? 999;
        const priorityB = rolePriority[b.role] ?? 999;
        
        if (priorityA !== priorityB) {
            return priorityA - priorityB;
        }
        
        // Same role: sort alphabetically by email
        return (a.email || '').localeCompare(b.email || '');
    });
}

/**
 * Check if user can manage members
 */
export function canManageMembers(userRole, isSiteAdmin) {
    return isSiteAdmin || userRole === 'Owner';
}

/**
 * Check if member can be removed
 */
export function canRemoveMember(member, currentUserEmail, currentUserRole, isSiteAdmin) {
    // Can't remove yourself
    if (member.email === currentUserEmail) {
        return false;
    }
    
    // Site admins can remove anyone
    if (isSiteAdmin) {
        return true;
    }
    
    // Owners can remove non-owners
    if (currentUserRole === 'Owner' && member.role !== 'Owner') {
        return true;
    }
    
    return false;
}
