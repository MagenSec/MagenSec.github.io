function GlossaryTerm({ term, definition }, html) {
    return html`
        <div class="glossary-term">
            <strong>${term}</strong>
            <p>${definition}</p>
        </div>
    `;
}

export function GlossaryTab(html) {
    const terms = [
        { term: 'CVE (Common Vulnerabilities and Exposures)', def: 'A standardized identifier for publicly disclosed vulnerabilities. Example: CVE-2025-1234. Each CVE has a unique record with details about the vulnerability, affected software, and fix availability.' },
        { term: 'CVSS (Common Vulnerability Scoring System)', def: 'A numerical score (0-10) measuring vulnerability severity. 0-3.9 = Low, 4.0-6.9 = Medium, 7.0-8.9 = High, 9.0-10.0 = Critical. Helps prioritize patching efforts.' },
        { term: 'CIS (Center for Internet Security)', def: 'Organization that publishes the CIS Critical Controls—18 essential security practices for protecting IT systems. Widely adopted in government and enterprise.' },
        { term: 'NIST (National Institute of Standards and Technology)', def: 'U.S. government agency that publishes the NIST Cybersecurity Framework. Provides guidance on managing cybersecurity risk.' },
        { term: 'DISA STIG', def: 'Defense Information Systems Agency Security Technical Implementation Guides. Detailed checklists for securing government IT systems.' },
        { term: 'ISO 27001', def: 'International standard for information security management. Provides a framework for managing information risks. Required for many compliance programs.' },
        { term: 'Zero-Day', def: 'A vulnerability unknown to vendors. No patch exists yet. Typically exploited before vendors even know about it. Extremely dangerous.' },
        { term: 'Exploit', def: 'Code or technique that takes advantage of a vulnerability to compromise a system. An "active exploit" means it\'s being used in real attacks.' },
        { term: 'Patch', def: 'A software update that fixes a vulnerability. Patches are released by vendors (Microsoft, Adobe, Apple, etc.). Critical patches should be applied immediately.' },
        { term: 'End-of-Life (EOL)', def: 'When a software version stops receiving security patches. Example: Windows 7 reached EOL in 2020. EOL software is extremely risky.' },
    ];

    return html`
        <div class="row">
            <div class="col-md-12">
                <h3>Security Glossary</h3>
                <p>Common security terms explained in plain language.</p>

                ${terms.map(({ term, def }) => GlossaryTerm({ term, definition: def }, html)).join('')}
            </div>
        </div>
    `;
}
