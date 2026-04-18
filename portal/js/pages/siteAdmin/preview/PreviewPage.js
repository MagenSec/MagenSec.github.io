/**
 * Preview Page - Report Previews
 * Route: #!/siteadmin/preview
 */

import ReportPreviewPage from './components/ReportPreview.js';

const { html, Component } = window;

export class PreviewPage extends Component {
    render() {
        return html`
            <div class="container-xl">
                <!-- Page header -->
                <div class="page-header d-print-none mb-3">
                    <div class="row align-items-center">
                        <div class="col">
                            <div class="page-pretitle">Site Admin</div>
                            <h2 class="page-title">Report Previews</h2>
                        </div>
                    </div>
                </div>

                <${ReportPreviewPage} embedded=${true} />
            </div>
        `;
    }
}
