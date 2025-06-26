// auth.js: Handles login, password hash check, and org/session storage
(async function() {
  const form = document.getElementById('loginForm');
  const errorDiv = document.getElementById('loginError');
  let passwords = {};

  // Load teamList.json (user/org hash mapping)
  async function loadPasswords() {
    let res;
    try {
      res = await fetch('teamList.json');
    } catch {
      res = await fetch('../teamList.json');
    }
    if (!res.ok) throw new Error('Failed to load teamList.json');
    passwords = await res.json();
  }

  // Simple SHA-256 hash
  async function hash(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  form.onsubmit = async (e) => {
    e.preventDefault();
    errorDiv.textContent = '';
    const username = form.username.value.trim();
    const password = form.password.value;
    if (!username || !password) return;
    await loadPasswords();
    if (!passwords[username]) {
      errorDiv.textContent = 'Invalid username or password.';
      return;
    }
    const hashVal = await hash(password);
    if (hashVal === passwords[username].hash) {
      // Store org/session info
      sessionStorage.setItem('org', passwords[username].org || username);
      sessionStorage.setItem('isAdmin', passwords[username].admin ? '1' : '0');
      window.location.href = 'index.html';
    } else {
      errorDiv.textContent = 'Invalid username or password.';
    }
  };
})();
