const { html } = window.htm;
import { GettingStartedTab } from './components/GettingStartedTab.js';
import { FAQTab } from './components/FAQTab.js';
import { GlossaryTab } from './components/GlossaryTab.js';
import { BestPracticesTab } from './components/BestPracticesTab.js';
import { SecurityTab } from './components/SecurityTab.js';

export function DocumentationHub() {
    let currentTab = 'getting-started';

    function renderTabContent() {
        const { html: htmlFunc } = window.htm;
        switch (currentTab) {
            case 'getting-started':
                return GettingStartedTab(htmlFunc);
            case 'best-practices':
                return BestPracticesTab(htmlFunc);
            case 'faq':
                return FAQTab(htmlFunc);
            case 'glossary':
                return GlossaryTab(htmlFunc);
            case 'security':
                return SecurityTab(htmlFunc);
            default:
                return htmlFunc`<p>Select a tab to view documentation</p>`;
        }
    }

    function setTab(tab) {
        currentTab = tab;
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    return html`
        <div class="page-wrapper">
            <div class="page-header d-print-none sticky-top bg-white">
                <div class="container-xl">
                    <div class="row align-items-center">
                        <div class="col">
                            <h2 class="page-title">Documentation & Help Center</h2>
                            <div class="text-muted">Everything you need to know about MagenSec security posture management.</div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="page-body">
                <div class="container-xl">
                    <!-- Navigation Tabs -->
                    <div class="nav-tabs-custom">
                        <button class="tab-btn ${currentTab === 'getting-started' ? 'active' : ''}" 
                                @click=${() => { setTab('getting-started'); }}>
                            Getting Started
                        </button>
                        <button class="tab-btn ${currentTab === 'best-practices' ? 'active' : ''}" 
                                @click=${() => { setTab('best-practices'); }}>
                            Best Practices
                        </button>
                        <button class="tab-btn ${currentTab === 'faq' ? 'active' : ''}" 
                                @click=${() => { setTab('faq'); }}>
                            FAQ
                        </button>
                        <button class="tab-btn ${currentTab === 'glossary' ? 'active' : ''}" 
                                @click=${() => { setTab('glossary'); }}>
                            Glossary
                        </button>
                        <button class="tab-btn ${currentTab === 'security' ? 'active' : ''}" 
                                @click=${() => { setTab('security'); }}>
                            Security & Privacy
                        </button>
                    </div>

                    ${renderTabContent()}
                </div>
            </div>
        </div>
    `;
}
