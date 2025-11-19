// Account page (profile, session, quick links)
// TODO: Wire to session/user context
const { html, render } = window.htm;
function AccountPage() {
  // TODO: Fetch user/session info
  return html`
    <div class="card">
      <div class="card-header"><strong>Account</strong></div>
      <div class="card-body">
        <!-- TODO: Render user info, orgs, quick links -->
        <EmptyState message="No account info" />
      </div>
    </div>
  `;
}
render(html`<AccountPage />`, document.getElementById('page-root'));
