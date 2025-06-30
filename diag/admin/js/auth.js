// auth.js: Handles login, password hash check, and org/session storage
(async function() {
  // If already logged in, redirect to dashboard
  if (sessionStorage.getItem('isLoggedIn')) {
    window.location.href = 'index.html';
    return;
  }

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
    errorDiv.classList.add('d-none');
    
    const username = form.username.value.trim();
    const password = form.password.value;
    if (!username || !password) return;
    
    // Show loading state
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="ti ti-loader-2 ti-spin me-2"></i>Signing in...';
    submitBtn.disabled = true;
    
    try {
      await loadPasswords();
      
      // Make username lookup case-insensitive
      const normalizedUsername = username.toLowerCase();
      const userRecord = Object.keys(passwords).find(key => key.toLowerCase() === normalizedUsername);
      
      if (!userRecord) {
        throw new Error('Invalid username or password.');
      }
      
      const hashVal = await hash(password);
      if (hashVal === passwords[userRecord].hash) {
        // Store org/session info with original case username
        sessionStorage.setItem('org', passwords[userRecord].org || userRecord);
        sessionStorage.setItem('username', userRecord);
        sessionStorage.setItem('isAdmin', passwords[userRecord].admin ? '1' : '0');
        sessionStorage.setItem('isLoggedIn', '1');
        window.location.href = 'index.html';
      } else {
        throw new Error('Invalid username or password.');
      }
    } catch (error) {
      errorDiv.textContent = error.message;
      errorDiv.classList.remove('d-none');
      
      // Reset button state
      submitBtn.innerHTML = originalBtnText;
      submitBtn.disabled = false;
    }
  };
})();
