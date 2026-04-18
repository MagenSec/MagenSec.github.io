export function GettingStartedPage() {
    const { html } = window;

    return html`
        <div class="container-xl py-4">
            <div class="row justify-content-center">
                <div class="col-lg-9">
                    <div class="card">
                        <div class="card-body p-4">
                            <h2 class="mb-2">Welcome to MagenSec</h2>
                            <p class="text-muted mb-4">
                                Your account is active, but no organization license is attached yet.
                            </p>

                            <div class="alert alert-info" role="alert">
                                Use a <strong>MAGICode</strong> when registering your first device to provision seats and days,
                                or ask your administrator to assign a business license.
                            </div>

                            <h4 class="mt-4">How to get started</h4>
                            <ol class="text-muted mb-4">
                                <li>Install and open the MagenSec client on your Windows device.</li>
                                <li>In the license popup, choose Personal and sign in with Gmail.</li>
                                <li>If you received a MAGICode, enter it to auto-provision your onboarding license.</li>
                                <li>Return to the portal to view devices and risk posture.</li>
                            </ol>

                            <div class="d-flex gap-2">
                                <a class="btn btn-primary" href="#!/docs">Open Documentation</a>
                                <a class="btn btn-outline-secondary" href="#!/account">View Account</a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}
