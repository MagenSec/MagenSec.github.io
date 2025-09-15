// MagenSec Hub - Organization Management Page Controller
class OrganizationPage {
    constructor() {
        this.organizations = [];
        this.selectedOrganization = null;
        this.currentView = 'list';
        this.filters = {
            status: 'all',
            plan: 'all',
            search: ''
        };
    }

    async render(route) {
        console.log('Organization management page rendering...');
        
        // Check admin permissions
        if (!window.MagenSecAuth.hasPermission('manage')) {
            window.MagenSecUI.showToast('Access denied: Organization management privileges required', 'error');
            window.MagenSecRouter.navigate('/dashboard');
            return;
        }

        await this.initialize();
    }

    async initialize() {
        this.setupEventHandlers();
        await this.loadOrganizations();
        this.renderPage();
    }

    setupEventHandlers() {
        // Organization actions
        document.addEventListener('click', (e) => {
            if (e.target.id === 'create-org-btn') {
                this.showCreateOrganizationModal();
            }
            if (e.target.classList.contains('edit-org-btn')) {
                this.editOrganization(e.target.dataset.orgId);
            }
            if (e.target.classList.contains('view-org-btn')) {
                this.viewOrganization(e.target.dataset.orgId);
            }
            if (e.target.classList.contains('disable-org-btn')) {
                this.disableOrganization(e.target.dataset.orgId);
            }
            if (e.target.classList.contains('delete-org-btn')) {
                this.deleteOrganization(e.target.dataset.orgId);
            }
        });

        // User management within organizations
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('manage-users-btn')) {
                this.manageOrganizationUsers(e.target.dataset.orgId);
            }
            if (e.target.classList.contains('add-user-btn')) {
                this.addUserToOrganization(e.target.dataset.orgId);
            }
        });

        // License management
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('manage-licenses-btn')) {
                this.manageOrganizationLicenses(e.target.dataset.orgId);
            }
            if (e.target.classList.contains('add-license-btn')) {
                this.addLicenseToOrganization(e.target.dataset.orgId);
            }
        });

        // Filters and search
        document.addEventListener('input', (e) => {
            if (e.target.id === 'org-search') {
                this.filters.search = e.target.value;
                this.applyFilters();
            }
        });

        document.addEventListener('change', (e) => {
            if (e.target.classList.contains('org-filter')) {
                const filterType = e.target.dataset.filter;
                this.filters[filterType] = e.target.value;
                this.applyFilters();
            }
        });

        // Modal handlers
        document.addEventListener('click', (e) => {
            if (e.target.id === 'save-org-btn') {
                this.saveOrganization();
            }
            if (e.target.id === 'cancel-org-btn') {
                this.hideOrganizationModal();
            }
        });

        // Back to list
        document.addEventListener('click', (e) => {
            if (e.target.id === 'back-to-list-btn') {
                this.showOrganizationList();
            }
        });
    }

    async loadOrganizations() {
        try {
            window.MagenSecUI.showLoading();

            const response = await window.MagenSecAPI.get('/api/v1/organizations');
            this.organizations = response.data || this.getMockOrganizations();

            window.MagenSecUI.hideLoading();
        } catch (error) {
            console.warn('Organization API not available, using mock data:', error);
            this.organizations = this.getMockOrganizations();
            window.MagenSecUI.hideLoading();
        }
    }

    renderPage() {
        const container = document.getElementById('main-content');
        
        if (this.currentView === 'list') {
            container.innerHTML = this.getListPageHTML();
            this.renderOrganizationList();
        } else if (this.currentView === 'details') {
            container.innerHTML = this.getDetailsPageHTML();
            this.renderOrganizationDetails();
        }
    }

    getListPageHTML() {
        return `
            <div class="space-y-6">
                <!-- Header -->
                <div class="flex justify-between items-center">
                    <div>
                        <h1 class="text-2xl font-bold text-gray-900">Organization Management</h1>
                        <p class="text-gray-600">Manage organizations, users, and licenses</p>
                    </div>
                    <button id="create-org-btn" class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                        <i class="fas fa-plus mr-2"></i>Create Organization
                    </button>
                </div>

                <!-- Filters -->
                <div class="bg-white rounded-lg shadow p-6">
                    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Search</label>
                            <input type="text" id="org-search" placeholder="Search organizations..." 
                                   class="w-full border border-gray-300 rounded-md px-3 py-2">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
                            <select class="org-filter w-full border border-gray-300 rounded-md px-3 py-2" data-filter="status">
                                <option value="all">All Statuses</option>
                                <option value="active">Active</option>
                                <option value="suspended">Suspended</option>
                                <option value="trial">Trial</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Plan</label>
                            <select class="org-filter w-full border border-gray-300 rounded-md px-3 py-2" data-filter="plan">
                                <option value="all">All Plans</option>
                                <option value="free">Free</option>
                                <option value="business">Business</option>
                                <option value="enterprise">Enterprise</option>
                            </select>
                        </div>
                        <div class="flex items-end">
                            <button id="refresh-orgs-btn" class="w-full bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700">
                                <i class="fas fa-sync mr-2"></i>Refresh
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Organizations List -->
                <div id="organizations-container" class="space-y-4">
                    <!-- Organizations will be rendered here -->
                </div>

                <!-- Organization Modal -->
                <div id="organization-modal" class="hidden fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
                    <div class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
                        <div class="mt-3">
                            <h3 id="modal-title" class="text-lg font-medium text-gray-900 mb-4">Create Organization</h3>
                            <div id="modal-content">
                                <!-- Modal content will be inserted here -->
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    getDetailsPageHTML() {
        return `
            <div class="space-y-6">
                <!-- Header -->
                <div class="flex justify-between items-center">
                    <div class="flex items-center space-x-4">
                        <button id="back-to-list-btn" class="text-blue-600 hover:text-blue-800">
                            <i class="fas fa-arrow-left mr-2"></i>Back to List
                        </button>
                        <div>
                            <h1 class="text-2xl font-bold text-gray-900" id="org-name">Organization Details</h1>
                            <p class="text-gray-600" id="org-description">Detailed organization information and management</p>
                        </div>
                    </div>
                    <div class="flex space-x-3">
                        <button id="edit-org-details-btn" class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                            <i class="fas fa-edit mr-2"></i>Edit
                        </button>
                        <button id="org-settings-btn" class="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700">
                            <i class="fas fa-cog mr-2"></i>Settings
                        </button>
                    </div>
                </div>

                <!-- Organization Details Content -->
                <div id="organization-details-content">
                    <!-- Details content will be rendered here -->
                </div>
            </div>
        `;
    }

    renderOrganizationList() {
        const container = document.getElementById('organizations-container');
        const filteredOrgs = this.getFilteredOrganizations();

        if (filteredOrgs.length === 0) {
            container.innerHTML = `
                <div class="text-center py-12">
                    <i class="fas fa-building text-gray-400 text-4xl mb-4"></i>
                    <h3 class="text-lg font-medium text-gray-900 mb-2">No organizations found</h3>
                    <p class="text-gray-600">Create your first organization to get started.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = filteredOrgs.map(org => `
            <div class="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
                <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-4">
                        <div class="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                            <i class="fas fa-building text-white"></i>
                        </div>
                        <div>
                            <h3 class="text-lg font-medium text-gray-900">${org.name}</h3>
                            <p class="text-sm text-gray-500">${org.domain || 'No domain configured'}</p>
                        </div>
                    </div>
                    <div class="flex items-center space-x-2">
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${this.getStatusColor(org.status)}">
                            ${org.status}
                        </span>
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            ${org.plan}
                        </span>
                    </div>
                </div>

                <div class="mt-4 grid grid-cols-4 gap-4 text-sm">
                    <div>
                        <span class="text-gray-500">Users:</span>
                        <span class="text-gray-900 font-medium">${org.userCount}</span>
                    </div>
                    <div>
                        <span class="text-gray-500">Devices:</span>
                        <span class="text-gray-900 font-medium">${org.deviceCount}/${org.maxDevices || '∞'}</span>
                    </div>
                    <div>
                        <span class="text-gray-500">Created:</span>
                        <span class="text-gray-900 font-medium">${new Date(org.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div>
                        <span class="text-gray-500">Last Active:</span>
                        <span class="text-gray-900 font-medium">${org.lastActivity ? new Date(org.lastActivity).toLocaleDateString() : 'Never'}</span>
                    </div>
                </div>

                <div class="mt-4 flex justify-between items-center">
                    <div class="text-sm text-gray-500">
                        ${org.description || 'No description provided'}
                    </div>
                    <div class="flex space-x-2">
                        <button class="view-org-btn text-blue-600 hover:text-blue-800 text-sm" data-org-id="${org.id}">
                            View Details
                        </button>
                        <button class="manage-users-btn text-green-600 hover:text-green-800 text-sm" data-org-id="${org.id}">
                            Manage Users
                        </button>
                        <button class="manage-licenses-btn text-purple-600 hover:text-purple-800 text-sm" data-org-id="${org.id}">
                            Licenses
                        </button>
                        <button class="edit-org-btn text-yellow-600 hover:text-yellow-800 text-sm" data-org-id="${org.id}">
                            Edit
                        </button>
                        ${org.status !== 'suspended' ? `
                            <button class="disable-org-btn text-red-600 hover:text-red-800 text-sm" data-org-id="${org.id}">
                                Suspend
                            </button>
                        ` : `
                            <button class="enable-org-btn text-green-600 hover:text-green-800 text-sm" data-org-id="${org.id}">
                                Enable
                            </button>
                        `}
                    </div>
                </div>
            </div>
        `).join('');
    }

    renderOrganizationDetails() {
        if (!this.selectedOrganization) return;

        const org = this.selectedOrganization;
        const container = document.getElementById('organization-details-content');

        // Update header
        document.getElementById('org-name').textContent = org.name;
        document.getElementById('org-description').textContent = `${org.userCount} users • ${org.deviceCount} devices • ${org.plan} plan`;

        container.innerHTML = `
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <!-- Organization Info -->
                <div class="lg:col-span-2 space-y-6">
                    <!-- Basic Information -->
                    <div class="bg-white rounded-lg shadow p-6">
                        <h3 class="text-lg font-medium text-gray-900 mb-4">Organization Information</h3>
                        <div class="grid grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Name</label>
                                <p class="text-gray-900">${org.name}</p>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Domain</label>
                                <p class="text-gray-900">${org.domain || 'Not configured'}</p>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Status</label>
                                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${this.getStatusColor(org.status)}">
                                    ${org.status}
                                </span>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Plan</label>
                                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                    ${org.plan}
                                </span>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Created</label>
                                <p class="text-gray-900">${new Date(org.createdAt).toLocaleDateString()}</p>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">Last Activity</label>
                                <p class="text-gray-900">${org.lastActivity ? new Date(org.lastActivity).toLocaleDateString() : 'Never'}</p>
                            </div>
                        </div>
                        ${org.description ? `
                            <div class="mt-4">
                                <label class="block text-sm font-medium text-gray-700">Description</label>
                                <p class="text-gray-900">${org.description}</p>
                            </div>
                        ` : ''}
                    </div>

                    <!-- Users Management -->
                    <div class="bg-white rounded-lg shadow p-6">
                        <div class="flex justify-between items-center mb-4">
                            <h3 class="text-lg font-medium text-gray-900">Users (${org.users?.length || 0})</h3>
                            <button class="add-user-btn bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700" data-org-id="${org.id}">
                                <i class="fas fa-plus mr-1"></i>Add User
                            </button>
                        </div>
                        <div class="space-y-3">
                            ${(org.users || []).slice(0, 5).map(user => `
                                <div class="flex items-center justify-between p-3 bg-gray-50 rounded">
                                    <div class="flex items-center space-x-3">
                                        <img src="${user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}`}" 
                                             class="w-8 h-8 rounded-full" alt="">
                                        <div>
                                            <p class="text-sm font-medium text-gray-900">${user.name}</p>
                                            <p class="text-xs text-gray-500">${user.email}</p>
                                        </div>
                                    </div>
                                    <div class="flex items-center space-x-2">
                                        <span class="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded">${user.role}</span>
                                        <span class="text-xs px-2 py-1 ${user.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'} rounded">
                                            ${user.status}
                                        </span>
                                    </div>
                                </div>
                            `).join('')}
                            ${(org.users?.length || 0) > 5 ? `
                                <button class="w-full text-center text-blue-600 hover:text-blue-800 text-sm py-2">
                                    View all ${org.users.length} users
                                </button>
                            ` : ''}
                        </div>
                    </div>

                    <!-- Devices Overview -->
                    <div class="bg-white rounded-lg shadow p-6">
                        <h3 class="text-lg font-medium text-gray-900 mb-4">Devices Overview</h3>
                        <div class="grid grid-cols-3 gap-4">
                            <div class="text-center">
                                <p class="text-2xl font-bold text-blue-600">${org.deviceCount}</p>
                                <p class="text-sm text-gray-500">Total Devices</p>
                            </div>
                            <div class="text-center">
                                <p class="text-2xl font-bold text-green-600">${org.activeDevices || Math.floor(org.deviceCount * 0.8)}</p>
                                <p class="text-sm text-gray-500">Active</p>
                            </div>
                            <div class="text-center">
                                <p class="text-2xl font-bold text-red-600">${org.offlineDevices || Math.floor(org.deviceCount * 0.2)}</p>
                                <p class="text-sm text-gray-500">Offline</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Sidebar -->
                <div class="space-y-6">
                    <!-- Quick Stats -->
                    <div class="bg-white rounded-lg shadow p-6">
                        <h3 class="text-lg font-medium text-gray-900 mb-4">Quick Stats</h3>
                        <div class="space-y-3">
                            <div class="flex justify-between">
                                <span class="text-sm text-gray-500">Total Users</span>
                                <span class="text-sm font-medium text-gray-900">${org.userCount}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-sm text-gray-500">Total Devices</span>
                                <span class="text-sm font-medium text-gray-900">${org.deviceCount}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-sm text-gray-500">Active Licenses</span>
                                <span class="text-sm font-medium text-gray-900">${org.licenseCount || 1}</span>
                            </div>
                            <div class="flex justify-between">
                                <span class="text-sm text-gray-500">Storage Used</span>
                                <span class="text-sm font-medium text-gray-900">${org.storageUsed || '2.5 GB'}</span>
                            </div>
                        </div>
                    </div>

                    <!-- Recent Activity -->
                    <div class="bg-white rounded-lg shadow p-6">
                        <h3 class="text-lg font-medium text-gray-900 mb-4">Recent Activity</h3>
                        <div class="space-y-3">
                            ${(org.recentActivity || this.getMockRecentActivity()).map(activity => `
                                <div class="flex items-start space-x-3">
                                    <div class="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                                    <div>
                                        <p class="text-sm text-gray-900">${activity.description}</p>
                                        <p class="text-xs text-gray-500">${new Date(activity.timestamp).toLocaleDateString()}</p>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <!-- Actions -->
                    <div class="bg-white rounded-lg shadow p-6">
                        <h3 class="text-lg font-medium text-gray-900 mb-4">Actions</h3>
                        <div class="space-y-2">
                            <button class="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded">
                                <i class="fas fa-users mr-2"></i>Manage Users
                            </button>
                            <button class="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded">
                                <i class="fas fa-key mr-2"></i>Manage Licenses
                            </button>
                            <button class="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded">
                                <i class="fas fa-laptop mr-2"></i>View Devices
                            </button>
                            <button class="w-full text-left px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded">
                                <i class="fas fa-chart-line mr-2"></i>Analytics
                            </button>
                            <hr class="my-2">
                            <button class="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded">
                                <i class="fas fa-ban mr-2"></i>Suspend Organization
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    getStatusColor(status) {
        switch (status) {
            case 'active': return 'bg-green-100 text-green-800';
            case 'suspended': return 'bg-red-100 text-red-800';
            case 'trial': return 'bg-yellow-100 text-yellow-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    }

    getFilteredOrganizations() {
        return this.organizations.filter(org => {
            const matchesStatus = this.filters.status === 'all' || org.status === this.filters.status;
            const matchesPlan = this.filters.plan === 'all' || org.plan.toLowerCase() === this.filters.plan;
            const matchesSearch = this.filters.search === '' || 
                                  org.name.toLowerCase().includes(this.filters.search.toLowerCase()) ||
                                  (org.domain && org.domain.toLowerCase().includes(this.filters.search.toLowerCase()));
            
            return matchesStatus && matchesPlan && matchesSearch;
        });
    }

    applyFilters() {
        this.renderOrganizationList();
    }

    // View switching
    showOrganizationList() {
        this.currentView = 'list';
        this.selectedOrganization = null;
        this.renderPage();
    }

    viewOrganization(orgId) {
        this.selectedOrganization = this.organizations.find(org => org.id === orgId);
        if (this.selectedOrganization) {
            this.currentView = 'details';
            this.renderPage();
        }
    }

    // Event handlers
    showCreateOrganizationModal() {
        const modal = document.getElementById('organization-modal');
        const title = document.getElementById('modal-title');
        const content = document.getElementById('modal-content');

        title.textContent = 'Create Organization';
        content.innerHTML = this.getOrganizationFormHTML();
        modal.classList.remove('hidden');
    }

    getOrganizationFormHTML(org = {}) {
        return `
            <div class="space-y-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700">Organization Name</label>
                    <input type="text" id="org-name-input" value="${org.name || ''}" 
                           class="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2" required>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700">Domain</label>
                    <input type="text" id="org-domain-input" value="${org.domain || ''}" 
                           class="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2" 
                           placeholder="example.com">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700">Plan</label>
                    <select id="org-plan-input" class="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2">
                        <option value="free" ${org.plan === 'free' ? 'selected' : ''}>Free</option>
                        <option value="business" ${org.plan === 'business' ? 'selected' : ''}>Business</option>
                        <option value="enterprise" ${org.plan === 'enterprise' ? 'selected' : ''}>Enterprise</option>
                    </select>
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700">Description</label>
                    <textarea id="org-description-input" rows="3" 
                              class="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2">${org.description || ''}</textarea>
                </div>
                <div class="flex justify-end space-x-3 pt-4">
                    <button id="cancel-org-btn" class="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50">
                        Cancel
                    </button>
                    <button id="save-org-btn" class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
                        Save
                    </button>
                </div>
            </div>
        `;
    }

    hideOrganizationModal() {
        document.getElementById('organization-modal').classList.add('hidden');
    }

    saveOrganization() {
        const name = document.getElementById('org-name-input').value.trim();
        const domain = document.getElementById('org-domain-input').value.trim();
        const plan = document.getElementById('org-plan-input').value;
        const description = document.getElementById('org-description-input').value.trim();

        if (!name) {
            window.MagenSecUI.showToast('Organization name is required', 'error');
            return;
        }

        // Create new organization (mock implementation)
        const newOrg = {
            id: 'org_' + Date.now(),
            name,
            domain: domain || null,
            plan,
            description: description || null,
            status: 'active',
            userCount: 0,
            deviceCount: 0,
            createdAt: new Date().toISOString(),
            lastActivity: null
        };

        this.organizations.unshift(newOrg);
        this.hideOrganizationModal();
        this.renderOrganizationList();
        
        window.MagenSecUI.showToast('Organization created successfully', 'success');
    }

    editOrganization(orgId) {
        const org = this.organizations.find(o => o.id === orgId);
        if (org) {
            const modal = document.getElementById('organization-modal');
            const title = document.getElementById('modal-title');
            const content = document.getElementById('modal-content');

            title.textContent = 'Edit Organization';
            content.innerHTML = this.getOrganizationFormHTML(org);
            modal.classList.remove('hidden');
        }
    }

    disableOrganization(orgId) {
        const org = this.organizations.find(o => o.id === orgId);
        if (org && confirm(`Are you sure you want to suspend "${org.name}"?`)) {
            org.status = 'suspended';
            this.renderOrganizationList();
            window.MagenSecUI.showToast(`Organization "${org.name}" suspended`, 'success');
        }
    }

    deleteOrganization(orgId) {
        const org = this.organizations.find(o => o.id === orgId);
        if (org && confirm(`Are you sure you want to delete "${org.name}"? This action cannot be undone.`)) {
            this.organizations = this.organizations.filter(o => o.id !== orgId);
            this.renderOrganizationList();
            window.MagenSecUI.showToast(`Organization "${org.name}" deleted`, 'success');
        }
    }

    manageOrganizationUsers(orgId) {
        window.MagenSecUI.showToast('User management interface - Feature coming soon', 'info');
    }

    manageOrganizationLicenses(orgId) {
        window.MagenSecUI.showToast('License management interface - Feature coming soon', 'info');
    }

    // Mock data
    getMockOrganizations() {
        return [
            {
                id: 'org1',
                name: 'TechCorp Industries',
                domain: 'techcorp.com',
                plan: 'Enterprise',
                description: 'Leading technology company with global operations',
                status: 'active',
                userCount: 45,
                deviceCount: 220,
                maxDevices: 500,
                createdAt: '2024-01-15T00:00:00Z',
                lastActivity: '2024-12-15T10:30:00Z',
                users: [
                    { name: 'John Smith', email: 'john@techcorp.com', role: 'admin', status: 'active', avatar: null },
                    { name: 'Sarah Johnson', email: 'sarah@techcorp.com', role: 'manager', status: 'active', avatar: null }
                ]
            },
            {
                id: 'org2',
                name: 'SecureBank Ltd',
                domain: 'securebank.com',
                plan: 'Business',
                description: 'Financial services with high security requirements',
                status: 'active',
                userCount: 28,
                deviceCount: 150,
                maxDevices: 200,
                createdAt: '2024-02-20T00:00:00Z',
                lastActivity: '2024-12-14T16:45:00Z',
                users: [
                    { name: 'Mike Wilson', email: 'mike@securebank.com', role: 'admin', status: 'active', avatar: null }
                ]
            },
            {
                id: 'org3',
                name: 'StartupXYZ',
                domain: null,
                plan: 'Free',
                description: null,
                status: 'trial',
                userCount: 5,
                deviceCount: 12,
                maxDevices: 25,
                createdAt: '2024-11-01T00:00:00Z',
                lastActivity: '2024-12-10T09:15:00Z',
                users: [
                    { name: 'Alex Chen', email: 'alex@startupxyz.io', role: 'admin', status: 'active', avatar: null }
                ]
            }
        ];
    }

    getMockRecentActivity() {
        return [
            { description: 'New user added', timestamp: new Date(Date.now() - 86400000).toISOString() },
            { description: 'Device registered', timestamp: new Date(Date.now() - 172800000).toISOString() },
            { description: 'License updated', timestamp: new Date(Date.now() - 259200000).toISOString() }
        ];
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = OrganizationPage;
}

// Make available globally
window.OrganizationPage = new OrganizationPage();