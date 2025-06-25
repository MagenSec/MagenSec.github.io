// adminView.js: Handles admin panel logic (admin only)
// TODO: Implement user/org management, password update, and audit logs
(function adminViewInit() {
  const container = document.getElementById('adminPanelContainer');
  if (!container) return;
  container.innerHTML = '<div class="loading">Loading admin panel...';
  if (window.__debugLog) window.__debugLog('Admin panel loaded.');
  // User/org management UI (client-side only, for demo)
  const userDiv = document.createElement('div');
  userDiv.innerHTML = `
    <h3>Users/Orgs (from teamList.json)</h3>
    <pre id="adminUserList"></pre>
    <button id="adminReloadUsers">Reload</button>
    <hr>
    <h3>Password Hash Tool</h3>
    <input type="text" id="adminPwdInput" placeholder="Enter password">
    <button id="adminHashBtn">Hash</button>
    <span id="adminHashOut"></span>
  `;
  container.appendChild(userDiv);
  function renderUsers() {
    fetch('teamList.json').then(r=>r.json()).then(users => {
      document.getElementById('adminUserList').textContent = JSON.stringify(users, null, 2);
      if (window.__debugLog) window.__debugLog('Admin loaded user/org list.');
    });
  }
  document.getElementById('adminReloadUsers').onclick = renderUsers;
  renderUsers();
  document.getElementById('adminHashBtn').onclick = async () => {
    const pwd = document.getElementById('adminPwdInput').value;
    if (!pwd) return;
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pwd));
    const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    document.getElementById('adminHashOut').textContent = hash;
    if (window.__debugLog) window.__debugLog('Admin hashed password.');
  };
})();
