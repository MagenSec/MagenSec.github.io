function FAQItem({ question, answer }, html) {
    const id = `faq-${question.replace(/[^a-z0-9]/gi, '-').toLowerCase()}`;
    return html`
        <div class="faq-item" id="${id}">
            <div class="faq-question" @click=${(e) => toggleFaq(e)}>
                <span>${question}</span>
                <span class="faq-arrow">⌄</span>
            </div>
            <div class="faq-answer">
                <p>${answer}</p>
            </div>
        </div>
    `;
}

function toggleFaq(e) {
    const question = e.currentTarget;
    const answer = question.nextElementSibling;
    question.classList.toggle('active');
    answer.classList.toggle('open');
}

export function FAQTab(html) {
    const faqs = [
        { q: 'Why is my Security Score low if Risk Score is high?', a: 'Security Score counts all vulnerabilities equally, while Risk Score weights by exploitability. You might have many unpatched vulnerabilities that aren\'t actively exploitable in your environment.' },
        { q: 'How often are devices scanned?', a: 'Devices scan every 1-4 hours depending on your configuration. Initial scan takes 3-5 minutes. Scans are lightweight and run in the background without affecting performance.' },
        { q: 'Can I exclude devices from scanning?', a: 'Yes. You can mark devices as "non-production" or "monitoring-only" to exclude them from scoring calculations. This is useful for test environments.' },
        { q: 'What if a device goes offline?', a: 'Devices show as "Offline" after 24 hours without contact. They remain in your inventory. When they come back online, scanning resumes automatically. No data is lost.' },
        { q: 'How do I improve my Compliance Score?', a: 'Start with your weakest framework function (shown on the Compliance page). Implement the recommended controls. Common first steps: enable MFA, configure logging, implement firewall rules.' },
        { q: 'Can I benchmark against other organizations?', a: 'Yes (Enterprise plan). You\'ll see how your scores compare to organizations in your industry and size. Use this to set realistic improvement targets.' },
        { q: 'How do I export reports?', a: 'Navigate to Reports, select your date range, and download PDF or CSV. Executive summaries are also available for sharing with leadership.' },
        { q: 'What does "Stale" mean for a device?', a: '"Stale" means the device hasn\'t checked in within the last 5 minutes (usually 6-24 hours). The device may be offline, in sleep mode, or experiencing network issues.' },
        { q: 'Can I set custom alert thresholds?', a: 'Yes. Configure alerts for score drops, new critical vulnerabilities, or compliance failures. Alerts can be sent to email, Slack, or webhooks.' },
        { q: 'Is my data encrypted?', a: 'Yes. All data in transit is encrypted with TLS 1.3. Data at rest is encrypted with AES-256. See the Security & Privacy section for compliance details.' },
    ];

    return html`
        <div class="row">
            <div class="col-md-12">
                <h3>Frequently Asked Questions</h3>
                <p>Can't find an answer? Contact our support team at support@magensec.io</p>

                <div class="faq-list">
                    ${faqs.map(({ q, a }) => FAQItem({ question: q, answer: a }, html)).join('')}
            </div>
        </div>
    `;
}
