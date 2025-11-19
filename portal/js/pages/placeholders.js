// Simple placeholder pages that follow the portal render pattern
const { html, Component } = window;

export class PosturePage extends Component {
  render() {
    return html`
      <div class="page-header d-print-none">
        <div class="container-xl">
          <div class="row g-2 align-items-center">
            <div class="col">
              <h2 class="page-title">Security Posture</h2>
              <div class="text-muted">Coming soon</div>
            </div>
          </div>
        </div>
      </div>
      <div class="card"><div class="card-body">This page is under construction.</div></div>
    `;
  }
}

export class InventoryPage extends Component {
  render() {
    return html`<div class="card"><div class="card-body">Inventory: Coming soon</div></div>`;
  }
}

export class TrendsPage extends Component {
  render() {
    return html`<div class="card"><div class="card-body">Trends: Coming soon</div></div>`;
  }
}

export class OrgsPage extends Component {
  render() {
    return html`<div class="card"><div class="card-body">Organizations: Coming soon</div></div>`;
  }
}

export class MembersPage extends Component {
  render() {
    return html`<div class="card"><div class="card-body">Members: Coming soon</div></div>`;
  }
}

export class LicensesPage extends Component {
  render() {
    return html`<div class="card"><div class="card-body">Licenses: Coming soon</div></div>`;
  }
}

export class AccountPage extends Component {
  render() {
    return html`<div class="card"><div class="card-body">Account: Coming soon</div></div>`;
  }
}
