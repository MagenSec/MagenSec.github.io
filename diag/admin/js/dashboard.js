// dashboard.js: Handles sidebar, view loading, expiry counter, and theme
(function() {
  console.log('dashboard.js loaded, window.dataService:', window.dataService);
  if (!sessionStorage.getItem('org')) {
    window.location.href = 'login.html';
    return;
  }
  const sidebar = document.getElementById('sidebar');
  const main = document.getElementById('mainContent');
  const expiryDiv = document.getElementById('expiryCounter');
  const org = sessionStorage.getItem('org');
  const isAdmin = sessionStorage.getItem('isAdmin') === '1';

  // Sidebar links
  const views = [
    { id: 'perf', label: 'Performance' },
    { id: 'apps', label: 'Applications' },
    { id: 'installs', label: 'Installs' },
    { id: 'security', label: 'Security' },
    { id: 'reports', label: 'Reports' }
  ];
  sidebar.innerHTML = `<h2>Org: ${org}</h2><ul>` +
    views.map(v => `<li><a href="#" data-view="${v.id}">${v.label}</a></li>`).join('') +
    (isAdmin ? '<li><a href="#" data-view="admin">Admin</a></li>' : '') +
    '<li><a href="#" id="logout">Logout</a></li></ul>';

  sidebar.onclick = (e) => {
    if (e.target.dataset.view) {
      loadView(e.target.dataset.view);
    } else if (e.target.id === 'logout') {
      sessionStorage.clear();
      window.location.href = 'login.html';
    }
  };

  async function loadView(view) {
    if (window.__debugLog) window.__debugLog('loadView(' + view + ') called.');
    main.innerHTML = '<div class="loading">Loading...';
    try {
      const res = await fetch(`views/${view}.html`);
      if (window.__debugLog) window.__debugLog('Fetched views/' + view + '.html, status: ' + res.status);
      const html = await res.text();
      main.innerHTML = html;
      // Dynamically load the JS for this view
      const scriptPath = `js/${view}View.js`;
      if (window.__debugLog) window.__debugLog('Loading script: ' + scriptPath);
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = scriptPath;
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
      });
      if (window.__debugLog) window.__debugLog('Loaded script for ' + view + ', now checking for window.' + view + 'ViewInit');
      if (window[view + 'ViewInit']) window[view + 'ViewInit']();
      else if (window.__debugLog) window.__debugLog('No window.' + view + 'ViewInit found after script load.');
    } catch (e) {
      main.innerHTML = '<div class="error">View not found or failed to load script.</div>';
      if (window.__debugLog) window.__debugLog('Error loading view ' + view + ': ' + e.message + ' Stack: ' + (e.stack||''));
    }
  }

  // On load, fetch SAS expiry (admin only)
  console.log('window.dataService:', window.dataService);
  if (isAdmin) {
    dataService.fetchSasExpiry().then(updateExpiry);
  }

  // Expiry counter (admin only, shows days/hours left)
  function updateExpiry() {
    if (!isAdmin) {
      expiryDiv.style.display = 'none';
      return;
    }
    expiryDiv.style.display = '';
    let expiry = dataService.getExpiry();
    if (!expiry || expiry < Date.now()) {
      expiryDiv.textContent = 'SAS Key expired!';
      return;
    }
    const msLeft = expiry - Date.now();
    const days = Math.floor(msLeft / (1000 * 60 * 60 * 24));
    const hours = Math.floor((msLeft / (1000 * 60 * 60)) % 24);
    const mins = Math.floor((msLeft / (1000 * 60)) % 60);
    expiryDiv.textContent = `SAS Key Expires In: ${days}d ${hours}h ${mins}m`;
  }
  setInterval(updateExpiry, 1000 * 60); // update every minute
  updateExpiry();

  // Debug log viewer (visible if ?debug in URL)
  function setupDebugLog() {
    const urlParams = new URLSearchParams(window.location.search);
    if (!urlParams.has('debug')) return;
    let debugDiv = document.createElement('div');
    debugDiv.id = 'debugLogViewer';
    debugDiv.style = 'position:fixed;bottom:0;left:0;right:0;max-height:30vh;overflow:auto;background:#222;color:#fff;font-size:0.9em;padding:0.5em;z-index:1000;border-top:2px solid #444;';
    document.body.appendChild(debugDiv);
    window.__debugLog = function(msg) {
      debugDiv.style.display = '';
      debugDiv.innerHTML += `<div>${new Date().toISOString()} - ${msg}</div>`;
      debugDiv.scrollTop = debugDiv.scrollHeight;
    };
    window.__debugLog('Debug log viewer enabled.');
  }
  setupDebugLog();

  // Load default view
  loadView('perf');
})();
