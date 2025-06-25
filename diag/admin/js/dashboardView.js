// dashboardView.js: Handles dashboard KPIs and charts, org/process filtering (no time range)
window.dashboardViewInit = async function dashboardViewInit() {
  let currentOrg = sessionStorage.getItem('org');
  let isAdmin = sessionStorage.getItem('isAdmin') === '1';
  let currentView = isAdmin ? 'global' : 'org';
  let currentProcess = 'all';

  const orgSelector = document.getElementById('orgSelectorContainer');
  const processSelector = document.getElementById('processSelectorContainer');
  const kpiRow = document.getElementById('kpiCardsRow');
  const chartsSection = document.getElementById('chartsSection');
  if (!kpiRow || !chartsSection) return;

  // Org selector for admin
  if (isAdmin) {
    orgSelector.innerHTML = '<label>Org: <select id="orgDropdown"><option value="global">Global</option></select></label>';
    // TODO: Fetch org list from backend or config
    // For now, add current org
    let orgDropdown = document.getElementById('orgDropdown');
    orgDropdown.innerHTML += `<option value="${currentOrg}">${currentOrg}</option>`;
    orgDropdown.value = currentView === 'global' ? 'global' : currentOrg;
    orgDropdown.onchange = function() {
      currentView = orgDropdown.value === 'global' ? 'global' : 'org';
      currentOrg = orgDropdown.value;
      updateDashboard();
    };
  } else {
    orgSelector.innerHTML = '';
    currentView = 'org';
  }

  // Process selector (populated after data fetch)
  processSelector.innerHTML = '<label>Process: <select id="processDropdown"><option value="all">All</option></select></label>';
  let processDropdown = document.getElementById('processDropdown');
  processDropdown.onchange = function() {
    currentProcess = processDropdown.value;
    updateDashboard();
  };

  async function updateDashboard() {
    // Fetch KPIs and charts with filters
    const kpis = await window.dataService.getKpis(currentView, currentOrg, currentProcess);
    const charts = await window.dataService.getCharts(currentView, currentOrg, currentProcess);
    window.renderKpiCards(kpis);
    window.renderCharts(charts);
    // Update process dropdown with available processes
    if (charts && charts[0] && charts[0].processList) {
      let options = '<option value="all">All</option>' + charts[0].processList.map(p => `<option value="${p}">${p}</option>`).join('');
      processDropdown.innerHTML = options;
      processDropdown.value = currentProcess;
    }
  }
  updateDashboard();
};
