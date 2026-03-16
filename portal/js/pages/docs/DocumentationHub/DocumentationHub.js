import { GettingStartedTab } from './components/GettingStartedTab.js';
import { PortalGuideTab } from './components/PortalGuideTab.js';
import { ScoresTab } from './components/ScoresTab.js';
import { BestPracticesTab } from './components/BestPracticesTab.js';
import { FAQTab } from './components/FAQTab.js';
import { GlossaryTab } from './components/GlossaryTab.js';
import { SecurityTab } from './components/SecurityTab.js';

const { Component } = window.preact;

const TABS = [
    { id: 'getting-started', label: 'Getting Started', icon: '🚀' },
    { id: 'portal-guide',    label: 'Portal Guide',    icon: '🗺️' },
    { id: 'scores',          label: 'Understanding Scores', icon: '📊' },
    { id: 'best-practices',  label: 'Best Practices',  icon: '🛡️' },
    { id: 'faq',             label: 'FAQ',              icon: '❓' },
    { id: 'glossary',        label: 'Glossary',         icon: '📖' },
    { id: 'security',        label: 'Security & Privacy', icon: '🔒' },
];

export class DocumentationHub extends Component {
    constructor(props) {
        super(props);
        this.state = { currentTab: 'getting-started' };
    }

    setTab(tab) {
        this.setState({ currentTab: tab });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    renderTabContent() {
        const html = window.html;
        switch (this.state.currentTab) {
            case 'getting-started': return GettingStartedTab(html);
            case 'portal-guide':    return PortalGuideTab(html);
            case 'scores':          return ScoresTab(html);
            case 'best-practices':  return BestPracticesTab(html);
            case 'faq':             return FAQTab(html);
            case 'glossary':        return GlossaryTab(html);
            case 'security':        return SecurityTab(html);
            default:                return html`<p>Select a tab.</p>`;
        }
    }

    render() {
        const html = window.html;
        const { currentTab } = this.state;

        return html`
            <div>
                <div class="page-header d-print-none" style="border-bottom:1px solid var(--tblr-border-color, #e0e0e0); padding:24px 0 0;">
                    <div class="container-xl">
                        <h2 class="page-title" style="margin-bottom:4px;">Documentation & Help Center</h2>
                        <div class="text-muted" style="margin-bottom:16px;">Learn how to use MagenSec, understand your scores, and follow security best practices.</div>
                        <div style="display:flex; gap:4px; overflow-x:auto; padding-bottom:0; margin:0 -4px;">
                            ${TABS.map(t => html`
                                <button
                                    key=${t.id}
                                    class="tab-btn ${currentTab === t.id ? 'active' : ''}"
                                    onClick=${() => this.setTab(t.id)}
                                    style="white-space:nowrap; padding:10px 14px; border:none; background:none; cursor:pointer; font-size:13px; font-weight:${currentTab === t.id ? '600' : '500'}; color:${currentTab === t.id ? '#0054a6' : 'inherit'}; border-bottom:3px solid ${currentTab === t.id ? '#0054a6' : 'transparent'}; transition:all 0.15s; opacity:${currentTab === t.id ? '1' : '0.7'};">
                                    ${t.icon} ${t.label}
                                </button>
                            `)}
                        </div>
                    </div>
                </div>

                <div class="page-body" style="padding-top:24px;">
                    <div class="container-xl">
                        ${this.renderTabContent()}
                    </div>
                </div>
            </div>
        `;
    }
}
