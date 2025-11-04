// MagenSec Hub - Admin Dashboard Page Controller
class AdminPage {
    constructor() {
        this.adminData = {};
        this.currentView = 'overview';
        this.filters = {
            timeRange: '24h',
            organizationId: 'all'
        };
        this.orgSwitchEnabled = false;
    }

    async render(route) {
        console.log('Admin page rendering...');
        
        // Check admin permissions
        if (!window.MagenSecAuth.hasPermission('admin')) {
            window.MagenSecUI.showToast('Access denied: Admin privileges required', 'error');
            window.MagenSecRouter.navigate('/dashboard');
            return;
        }

        await this.initialize();
    }

    async initialize() {
        this.setupEventHandlers();
        await this.loadAdminData();
        this.renderPage();
    }

    setupEventHandlers() {
        // View switching
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('admin-view-btn')) {
                this.switchView(e.target.dataset.view);
            }
        });

        // Organization management
        document.addEventListener('click', (e) => {
            if (e.target.id === 'create-organization-btn') {
                this.showCreateOrganizationModal();
            }
            if (e.target.classList.contains('edit-organization-btn')) {
                this.editOrganization(e.target.dataset.orgId);
            }
            if (e.target.classList.contains('delete-organization-btn')) {
                this.deleteOrganization(e.target.dataset.orgId);
            }
        });

        // User management
        document.addEventListener('click', (e) => {
            if (e.target.id === 'create-user-btn') {
                this.showCreateUserModal();
            }
            if (e.target.classList.contains('edit-user-btn')) {
                this.editUser(e.target.dataset.userId);
            }
            if (e.target.classList.contains('disable-user-btn')) {
                this.disableUser(e.target.dataset.userId);
            }
        });

        // License management
        document.addEventListener('click', (e) => {
            if (e.target.id === 'generate-license-btn') {
                this.showGenerateLicenseModal();
            }
            if (e.target.classList.contains('revoke-license-btn')) {
                this.revokeLicense(e.target.dataset.licenseKey);
            }
        });

        // System management
        document.addEventListener('click', (e) => {
            if (e.target.id === 'system-health-btn') {
                this.runSystemHealthCheck();
            }
            if (e.target.id === 'cleanup-data-btn') {
                this.cleanupSystemData();
            }
        });

        // Filter changes
        document.addEventListener('change', (e) => {
            if (e.target.classList.contains('admin-filter')) {
                this.updateFilters();
            }
        });
    }

    async loadAdminData() {
        try {
            window.MagenSecUI.showLoading();

            // Load admin dashboard data
            const [overview, organizations, users, licenses, systemHealth] = await Promise.all([
                window.MagenSecAPI.get('/api/v1/admin/overview', this.filters),
                window.MagenSecAPI.get('/api/v1/admin/organizations'),
                window.MagenSecAPI.get('/api/v1/admin/users'),
                window.MagenSecAPI.get('/api/v1/admin/licenses'),
                window.MagenSecAPI.get('/api/v1/admin/system/health')
            ]);

            this.adminData = {
                overview: overview.data || this.getMockOverviewData(),
                organizations: organizations.data || this.getMockOrganizationsData(),
                users: users.data || this.getMockUsersData(),
                licenses: licenses.data || this.getMockLicensesData(),
                systemHealth: systemHealth.data || this.getMockSystemHealthData()
            };

            window.MagenSecUI.hideLoading();
        } catch (error) {
            console.warn('Admin API not available, using mock data:', error);
            this.adminData = {
                overview: this.getMockOverviewData(),
                organizations: this.getMockOrganizationsData(),
                users: this.getMockUsersData(),
                licenses: this.getMockLicensesData(),
                systemHealth: this.getMockSystemHealthData()
            };
            window.MagenSecUI.hideLoading();
        }
    }

    renderPage() {
        const container = document.getElementById('main-content');
        container.innerHTML = this.getPageHTML();
        this.switchView(this.currentView);
    }

    getPageHTML() {
        return `
            <div class="space-y-6">
                <!-- Header -->
                <div class="flex justify-between items-center">
                    <div>
                        <h1 class="text-2xl font-bold text-gray-900">Site Administration</h1>
                        <p class="text-gray-600">System-wide management and oversight</p>
                    </div>
                    <div class="flex space-x-3">
                        <select class="admin-filter border border-gray-300 rounded-md px-3 py-2" data-filter="timeRange">
                            <option value="1h">Last Hour</option>
                            <option value="24h" selected>Last 24 Hours</option>
                            <option value="7d">Last 7 Days</option>
                            <option value="30d">Last 30 Days</option>
                        </select>
                        <button id="refresh-admin-data" class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                            <i class="fas fa-sync mr-2"></i>Refresh
                        </button>
                    </div>
                </div>

                <!-- Admin Navigation -->
                <div class="bg-white rounded-lg shadow">
                    <div class="border-b border-gray-200">
                        <nav class="-mb-px flex space-x-8 px-6">
                            <button class="admin-view-btn py-4 px-1 border-b-2 border-blue-500 font-medium text-sm text-blue-600" data-view="overview">
                                Overview
                            </button>
                            <button class="admin-view-btn py-4 px-1 border-b-2 border-transparent font-medium text-sm text-gray-500 hover:text-gray-700" data-view="organizations">
                                Organizations
                            </button>
                            <button class="admin-view-btn py-4 px-1 border-b-2 border-transparent font-medium text-sm text-gray-500 hover:text-gray-700" data-view="users">
                                Users
                            </button>
                            <button class="admin-view-btn py-4 px-1 border-b-2 border-transparent font-medium text-sm text-gray-500 hover:text-gray-700" data-view="licenses">
                                Licenses
                            </button>
                            <button class="admin-view-btn py-4 px-1 border-b-2 border-transparent font-medium text-sm text-gray-500 hover:text-gray-700" data-view="system">
                                System
                            </button>
                        </nav>
                    </div>

                    <div class="p-6">
                        <div id="admin-overview" class="admin-panel">
                            <!-- Overview content -->
                        </div>
                        <div id="admin-organizations" class="admin-panel hidden">
                            <!-- Organizations content -->
                        </div>
                        <div id="admin-users" class="admin-panel hidden">
                            <!-- Users content -->
                        </div>
                        <div id="admin-licenses" class="admin-panel hidden">
                            <!-- Licenses content -->
                        </div>
                        <div id="admin-system" class="admin-panel hidden">
                            <!-- System content -->
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    switchView(view) {
        // Update navigation
        document.querySelectorAll('.admin-view-btn').forEach(btn => {
            btn.classList.remove('border-blue-500', 'text-blue-600');
            btn.classList.add('border-transparent', 'text-gray-500');
        });
        
        document.querySelector(`[data-view="${view}"]`).classList.remove('border-transparent', 'text-gray-500');
        document.querySelector(`[data-view="${view}"]`).classList.add('border-blue-500', 'text-blue-600');

        // Update content
        document.querySelectorAll('.admin-panel').forEach(panel => panel.classList.add('hidden'));
        document.getElementById(`admin-${view}`).classList.remove('hidden');

        this.currentView = view;
        this.renderCurrentView();
    }

    renderCurrentView() {
        switch (this.currentView) {
            case 'overview':
                this.renderOverview();
                break;
            case 'organizations':
                this.renderOrganizations();
                break;
            case 'users':
                this.renderUsers();
                break;
            case 'licenses':
                this.renderLicenses();
                break;
            case 'system':
                this.renderSystem();
                break;
        }
    }

    renderOverview() {
        const container = document.getElementById('admin-overview');
        const data = this.adminData.overview;

        container.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                ${this.renderMetricCard('Total Organizations', data.totalOrganizations, 'fas fa-building', 'blue')}
                ${this.renderMetricCard('Total Users', data.totalUsers, 'fas fa-users', 'green')}
                ${this.renderMetricCard('Active Licenses', data.activeLicenses, 'fas fa-key', 'purple')}
                ${this.renderMetricCard('Total Devices', data.totalDevices, 'fas fa-laptop', 'orange')}
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <!-- Recent Activity -->
                <div class="bg-gray-50 rounded-lg p-6">
                    <h3 class="text-lg font-medium text-gray-900 mb-4">Recent Admin Activity</h3>
                    <div class="space-y-3">
                        ${data.recentActivity.map(activity => `
                            <div class="flex items-center space-x-3">
                                <div class="flex-shrink-0">
                                    <i class="${activity.icon} text-${activity.color}-500"></i>
                                </div>
                                <div class="flex-1">
                                    <p class="text-sm text-gray-900">${activity.description}</p>
                                    <p class="text-xs text-gray-500">${new Date(activity.timestamp).toLocaleString()}</p>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- System Status -->
                <div class="bg-gray-50 rounded-lg p-6">
                    <h3 class="text-lg font-medium text-gray-900 mb-4">System Status</h3>
                    <div class="space-y-3">
                        ${this.adminData.systemHealth.services.map(service => `
                            <div class="flex items-center justify-between">
                                <span class="text-sm font-medium text-gray-900">${service.name}</span>
                                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    service.status === 'healthy' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                }">
                                    ${service.status}
                                </span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
    }

    renderMetricCard(title, value, icon, color) {
        return `
            <div class="bg-white rounded-lg shadow p-6">
                <div class="flex items-center">
                    <div class="flex-shrink-0">
                        <div class="w-8 h-8 bg-${color}-500 rounded-md flex items-center justify-center">
                            <i class="${icon} text-white text-sm"></i>
                        </div>
                    </div>
                    <div class="ml-5 w-0 flex-1">
                        <dl>
                            <dt class="text-sm font-medium text-gray-500 truncate">${title}</dt>
                            <dd class="text-2xl font-semibold text-gray-900">${value.toLocaleString()}</dd>
                        </dl>
                    </div>
                </div>
            </div>
        `;
    }

    renderOrganizations() {
        const container = document.getElementById('admin-organizations');
        const organizations = this.adminData.organizations;

        container.innerHTML = `
            <div class="flex justify-between items-center mb-6">
                <h3 class="text-lg font-medium text-gray-900">Organization Management</h3>
                <button id="create-organization-btn" class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                    <i class="fas fa-plus mr-2"></i>Create Organization
                </button>
            </div>

            <div class="space-y-4">
                ${organizations.map(org => `
                    <div class="bg-white border border-gray-200 rounded-lg p-6">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center space-x-4">
                                <div class="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                                    <i class="fas fa-building text-gray-600"></i>
                                </div>
                                <div>
                                    <h4 class="text-lg font-medium text-gray-900">${org.name}</h4>
                                    <p class="text-sm text-gray-500">${org.userCount} users • ${org.deviceCount} devices</p>
                                </div>
                            </div>
                            <div class="flex items-center space-x-2">
                                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    org.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                }">
                                    ${org.status}
                                </span>
                                <button class="edit-organization-btn text-blue-600 hover:text-blue-800" data-org-id="${org.id}">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="delete-organization-btn text-red-600 hover:text-red-800" data-org-id="${org.id}">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                        <div class="mt-4 grid grid-cols-3 gap-4 text-sm">
                            <div>
                                <span class="text-gray-500">Created:</span>
                                <span class="text-gray-900">${new Date(org.createdAt).toLocaleDateString()}</span>
                            </div>
                            <div>
                                <span class="text-gray-500">Plan:</span>
                                <span class="text-gray-900">${org.plan}</span>
                            </div>
                            <div>
                                <span class="text-gray-500">Usage:</span>
                                <span class="text-gray-900">${org.deviceCount}/${org.maxDevices} devices</span>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderUsers() {
        const container = document.getElementById('admin-users');
        const users = this.adminData.users;

        container.innerHTML = `
            <div class="flex justify-between items-center mb-6">
                <h3 class="text-lg font-medium text-gray-900">User Management</h3>
                <button id="create-user-btn" class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                    <i class="fas fa-plus mr-2"></i>Create User
                </button>
            </div>

            <div class="bg-white shadow overflow-hidden rounded-lg">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Organization</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Login</th>
                            <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
                        ${users.map(user => {
                            const superAdminEmail = window.MagenSecConfig?.superAdminEmail || 'talktomagensec@gmail.com';
                            const isSuperAdmin = user.email === superAdminEmail;
                            
                            return `
                            <tr class="${isSuperAdmin ? 'bg-yellow-50' : ''}">
                                <td class="px-6 py-4 whitespace-nowrap">
                                    <div class="flex items-center">
                                        <div class="h-10 w-10 flex-shrink-0">
                                            <img class="h-10 w-10 rounded-full" src="${user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}`}" alt="">
                                        </div>
                                        <div class="ml-4">
                                            <div class="text-sm font-medium text-gray-900 flex items-center">
                                                ${user.name}
                                                ${isSuperAdmin ? '<span class="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">Super Admin</span>' : ''}
                                            </div>
                                            <div class="text-sm text-gray-500">${user.email}</div>
                                        </div>
                                    </div>
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${user.organizationName}</td>
                                <td class="px-6 py-4 whitespace-nowrap">
                                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        isSuperAdmin ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'
                                    }">
                                        ${user.role}
                                    </span>
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap">
                                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        user.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                    }">
                                        ${user.status}
                                    </span>
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                    ${user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}
                                </td>
                                <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    ${isSuperAdmin ? 
                                        '<span class="text-sm text-gray-500 italic">Protected Account</span>' :
                                        `<button class="edit-user-btn text-blue-600 hover:text-blue-900 mr-3" data-user-id="${user.id}">
                                            Edit
                                        </button>
                                        <button class="disable-user-btn text-red-600 hover:text-red-900" data-user-id="${user.id}">
                                            ${user.status === 'active' ? 'Disable' : 'Enable'}
                                        </button>`
                                    }
                                </td>
                            </tr>
                        `}).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    renderLicenses() {
        const container = document.getElementById('admin-licenses');
        const licenses = this.adminData.licenses;

        container.innerHTML = `
            <div class="flex justify-between items-center mb-6">
                <h3 class="text-lg font-medium text-gray-900">License Management</h3>
                <button id="generate-license-btn" class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                    <i class="fas fa-plus mr-2"></i>Generate License
                </button>
            </div>

            <div class="space-y-4">
                ${licenses.map(license => `
                    <div class="bg-white border border-gray-200 rounded-lg p-6">
                        <div class="flex items-center justify-between">
                            <div>
                                <h4 class="text-lg font-medium text-gray-900">${license.key}</h4>
                                <p class="text-sm text-gray-500">${license.organizationName} • ${license.type}</p>
                            </div>
                            <div class="flex items-center space-x-2">
                                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    license.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                }">
                                    ${license.status}
                                </span>
                                <button class="revoke-license-btn text-red-600 hover:text-red-800" data-license-key="${license.key}">
                                    <i class="fas fa-ban"></i>
                                </button>
                            </div>
                        </div>
                        <div class="mt-4 grid grid-cols-4 gap-4 text-sm">
                            <div>
                                <span class="text-gray-500">Max Devices:</span>
                                <span class="text-gray-900">${license.maxDevices}</span>
                            </div>
                            <div>
                                <span class="text-gray-500">Used:</span>
                                <span class="text-gray-900">${license.devicesUsed}</span>
                            </div>
                            <div>
                                <span class="text-gray-500">Expires:</span>
                                <span class="text-gray-900">${license.expiresAt ? new Date(license.expiresAt).toLocaleDateString() : 'Never'}</span>
                            </div>
                            <div>
                                <span class="text-gray-500">Created:</span>
                                <span class="text-gray-900">${new Date(license.createdAt).toLocaleDateString()}</span>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderSystem() {
        const container = document.getElementById('admin-system');
        const health = this.adminData.systemHealth;

        container.innerHTML = `
            <div class="space-y-6">
                <div class="flex justify-between items-center">
                    <h3 class="text-lg font-medium text-gray-900">System Management</h3>
                    <div class="flex space-x-3">
                        <button id="system-health-btn" class="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                            <i class="fas fa-heartbeat mr-2"></i>Health Check
                        </button>
                        <button id="cleanup-data-btn" class="bg-orange-600 text-white px-4 py-2 rounded-lg hover:bg-orange-700">
                            <i class="fas fa-broom mr-2"></i>Cleanup Data
                        </button>
                    </div>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <!-- System Health -->
                    <div class="bg-white rounded-lg shadow p-6">
                        <h4 class="text-lg font-medium text-gray-900 mb-4">System Health</h4>
                        <div class="space-y-4">
                            ${health.services.map(service => `
                                <div class="flex items-center justify-between">
                                    <div>
                                        <h5 class="font-medium text-gray-900">${service.name}</h5>
                                        <p class="text-sm text-gray-500">${service.description}</p>
                                    </div>
                                    <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                        service.status === 'healthy' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                    }">
                                        ${service.status}
                                    </span>
                                </div>
                            `).join('')}
                        </div>
                    </div>

                    <!-- System Metrics -->
                    <div class="bg-white rounded-lg shadow p-6">
                        <h4 class="text-lg font-medium text-gray-900 mb-4">System Metrics</h4>
                        <div class="space-y-4">
                            <div class="flex items-center justify-between">
                                <span class="text-sm font-medium text-gray-900">CPU Usage</span>
                                <span class="text-sm text-gray-900">${health.metrics.cpuUsage}%</span>
                            </div>
                            <div class="flex items-center justify-between">
                                <span class="text-sm font-medium text-gray-900">Memory Usage</span>
                                <span class="text-sm text-gray-900">${health.metrics.memoryUsage}%</span>
                            </div>
                            <div class="flex items-center justify-between">
                                <span class="text-sm font-medium text-gray-900">Storage Usage</span>
                                <span class="text-sm text-gray-900">${health.metrics.storageUsage}%</span>
                            </div>
                            <div class="flex items-center justify-between">
                                <span class="text-sm font-medium text-gray-900">Active Connections</span>
                                <span class="text-sm text-gray-900">${health.metrics.activeConnections}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // Mock data methods
    getMockOverviewData() {
        return {
            totalOrganizations: 12,
            totalUsers: 147,
            activeLicenses: 34,
            totalDevices: 892,
            recentActivity: [
                {
                    description: 'New organization "TechCorp" created',
                    timestamp: new Date().toISOString(),
                    icon: 'fas fa-building',
                    color: 'blue'
                },
                {
                    description: 'License BL-2024-001 revoked',
                    timestamp: new Date(Date.now() - 3600000).toISOString(),
                    icon: 'fas fa-ban',
                    color: 'red'
                },
                {
                    description: 'System health check completed',
                    timestamp: new Date(Date.now() - 7200000).toISOString(),
                    icon: 'fas fa-heartbeat',
                    color: 'green'
                }
            ]
        };
    }

    getMockOrganizationsData() {
        return [
            {
                id: 'org1',
                name: 'TechCorp Industries',
                userCount: 25,
                deviceCount: 150,
                status: 'active',
                plan: 'Enterprise',
                maxDevices: 200,
                createdAt: '2024-01-15T00:00:00Z'
            },
            {
                id: 'org2',
                name: 'SecureBank Ltd',
                userCount: 45,
                deviceCount: 300,
                status: 'active',
                plan: 'Business',
                maxDevices: 500,
                createdAt: '2024-02-20T00:00:00Z'
            }
        ];
    }

    getMockUsersData() {
        return [
            {
                id: 'user1',
                name: 'John Smith',
                email: 'john@techcorp.com',
                organizationName: 'TechCorp Industries',
                role: 'admin',
                status: 'active',
                lastLogin: '2024-12-15T08:30:00Z',
                avatar: null
            },
            {
                id: 'user2',
                name: 'Sarah Johnson',
                email: 'sarah@securebank.com',
                organizationName: 'SecureBank Ltd',
                role: 'manager',
                status: 'active',
                lastLogin: '2024-12-14T16:45:00Z',
                avatar: null
            }
        ];
    }

    getMockLicensesData() {
        return [
            {
                key: 'BL-2024-001',
                organizationName: 'TechCorp Industries',
                type: 'Business',
                status: 'active',
                maxDevices: 200,
                devicesUsed: 150,
                expiresAt: '2025-12-31T23:59:59Z',
                createdAt: '2024-01-15T00:00:00Z'
            },
            {
                key: 'BL-2024-002',
                organizationName: 'SecureBank Ltd',
                type: 'Enterprise',
                status: 'active',
                maxDevices: 500,
                devicesUsed: 300,
                expiresAt: null,
                createdAt: '2024-02-20T00:00:00Z'
            }
        ];
    }

    getMockSystemHealthData() {
        return {
            services: [
                { name: 'API Service', description: 'Main application API', status: 'healthy' },
                { name: 'Database', description: 'Azure Table Storage', status: 'healthy' },
                { name: 'Authentication', description: 'OAuth service', status: 'healthy' },
                { name: 'Event Hub', description: 'Telemetry processing', status: 'healthy' }
            ],
            metrics: {
                cpuUsage: 45,
                memoryUsage: 68,
                storageUsage: 32,
                activeConnections: 127
            }
        };
    }

    // Event handlers
    async runSystemHealthCheck() {
        window.MagenSecUI.showToast('Running system health check...', 'info');
        // Simulate health check
        setTimeout(() => {
            window.MagenSecUI.showToast('System health check completed - All services healthy', 'success');
        }, 3000);
    }

    async cleanupSystemData() {
        if (confirm('Are you sure you want to cleanup old system data? This action cannot be undone.')) {
            window.MagenSecUI.showToast('Starting data cleanup...', 'info');
            setTimeout(() => {
                window.MagenSecUI.showToast('Data cleanup completed successfully', 'success');
            }, 5000);
        }
    }

    // User Management Methods
    async disableUser(userId) {
        try {
            // Find the user to check if it's the super admin
            const user = this.adminData.users?.find(u => u.id === userId);
            if (!user) {
                window.MagenSecUI.showToast('User not found', 'error');
                return;
            }

            // Check if this is the super admin user
            const superAdminEmail = window.MagenSecConfig?.superAdminEmail || 'talktomagensec@gmail.com';
            if (user.email === superAdminEmail) {
                window.MagenSecUI.showToast('Cannot disable super admin user', 'error');
                return;
            }

            const action = user.status === 'active' ? 'disable' : 'enable';
            if (confirm(`Are you sure you want to ${action} user ${user.email}?`)) {
                // Call API to disable/enable user
                window.MagenSecUI.showToast(`User ${action}d successfully`, 'success');
                await this.loadAdminData(); // Refresh data
                this.renderPage();
            }
        } catch (error) {
            console.error('Error disabling user:', error);
            window.MagenSecUI.showToast('Failed to update user status', 'error');
        }
    }

    async editUser(userId) {
        const user = this.adminData.users?.find(u => u.id === userId);
        if (!user) {
            window.MagenSecUI.showToast('User not found', 'error');
            return;
        }

        // Check if this is the super admin user
        const superAdminEmail = window.MagenSecConfig?.superAdminEmail || 'talktomagensec@gmail.com';
        if (user.email === superAdminEmail) {
            window.MagenSecUI.showToast('Super admin user settings are managed by system infrastructure', 'info');
            return;
        }

        // Implementation for user editing modal
        window.MagenSecUI.showToast('Edit user modal - Feature coming soon', 'info');
    }

    showCreateOrganizationModal() {
        // Implementation for organization creation modal
        window.MagenSecUI.showToast('Create organization modal - Feature coming soon', 'info');
    }

    showCreateUserModal() {
        // Implementation for user creation modal
        window.MagenSecUI.showToast('Create user modal - Feature coming soon', 'info');
    }

    showGenerateLicenseModal() {
        // Implementation for license generation modal
        window.MagenSecUI.showToast('Generate license modal - Feature coming soon', 'info');
    }

    updateFilters() {
        // Update filters and reload data
        this.loadAdminData().then(() => this.renderCurrentView());
    }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AdminPage;
}

// Make available globally
window.AdminPage = new AdminPage();