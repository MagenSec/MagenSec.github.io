// MagenSec Help Page
class HelpPage {
    async render(route) {
        const mainContent = document.getElementById('main-content');
        if (!mainContent) return;
        mainContent.innerHTML = `
            <div class="p-8 max-w-2xl mx-auto">
                <h1 class="text-3xl font-bold mb-4">Welcome to MagenSec Portal</h1>
                <p class="mb-4">You are not a member of any organization yet.</p>
                <ul class="list-disc pl-6 mb-4">
                    <li>To get started, ask your admin to invite you to an organization.</li>
                    <li>Or, create a personal license to use MagenSec for yourself or your family (up to 5 devices).</li>
                    <li>See <a href="/portal/#/settings" class="text-blue-600 underline">Settings</a> for license options.</li>
                    <li>Download the <a href="https://magensec.com/download" class="text-blue-600 underline">MagenSec Client</a> to begin protecting your devices.</li>
                </ul>
                <p class="mb-2">Need help? <a href="mailto:support@magensec.com" class="text-blue-600 underline">Contact Support</a></p>
            </div>
        `;
    }
}

window.HelpPage = new HelpPage();
