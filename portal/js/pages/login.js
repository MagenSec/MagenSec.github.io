/**
 * Login Page - Preact + HTM with Tabler
 * Uses Tabler's page-center pattern for full-page login
 */

import { auth } from '../auth.js';

export function LoginPage({ authenticating = false }) {
    const { html, preactHooks } = window;
    const { useState } = preactHooks;
    const [loading, setLoading] = useState(false);

    const handleLogin = async () => {
        if (loading || authenticating) return;
        try {
            setLoading(true);
            await auth.startOAuth();
        } catch (err) {
            console.error('[Login] OAuth start failed:', err);
            alert('Unable to start sign-in. Please try again.');
            setLoading(false);
        }
    };
    
    const isBusy = loading || authenticating;
    const buttonLabel = authenticating ? 'Completing sign-in…' : 'Sign in with Google';

    return html`
        <div class="page page-center">
            <div class="container container-tight py-4">
                <div class="text-center mb-4">
                    <a href="." class="navbar-brand navbar-brand-autodark d-inline-flex align-items-center">
                        <svg class="icon me-2" width="48" height="48" viewBox="0 0 24 24" stroke-width="1.5" stroke="#2fb344" fill="none">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                            <path d="M9 12l2 2 4-4"></path>
                        </svg>
                        <span style="font-size: 24px; font-weight: 700; color: #1e293b;">MagenSec</span>
                    </a>
                    <div class="text-center mt-2">
                        <div class="text-muted" style="font-size: 14px; letter-spacing: 0.5px;">AI-Powered Security Intelligence</div>
                    </div>
                </div>
                
                <div class="card card-md">
                    <div class="card-body">
                        <h2 class="h2 text-center mb-2">Welcome Back</h2>
                        <p class="text-center text-muted mb-4">Sign in to access your security dashboard</p>
                        
                        ${authenticating ? html`
                            <div class="mb-3">
                                <div class="progress progress-sm">
                                    <div class="progress-bar progress-bar-indeterminate bg-primary" style="width: 100%"></div>
                                </div>
                                <div class="text-center text-muted small mt-2">
                                    Verifying credentials with Google...
                                </div>
                            </div>
                        ` : null}
                        
                        <button
                            onclick=${handleLogin}
                            class="btn btn-primary w-100 d-flex align-items-center justify-content-center"
                            disabled=${isBusy}
                            aria-label="Sign in with Google"
                            aria-busy=${isBusy}
                        >
                            ${isBusy ? html`
                                <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                            ` : html`
                                <svg class="me-2" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
                                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                                </svg>
                            `}
                            ${buttonLabel}
                        </button>
                        
                        <div class="text-center text-muted mt-3">
                            <small>
                                By signing in, you agree to our
                                <a href="../terms.html" class="text-reset text-decoration-underline">Terms of Service</a>
                                and <a href="../terms.html" class="text-reset text-decoration-underline">Privacy Policy</a>
                            </small>
                        </div>
                    </div>
                </div>
                
                <!-- Social Proof Stats -->
                <div class="text-center mt-4 mb-4">
                    <div class="card stats-card">
                        <div class="card-body py-3">
                            <div class="row g-0">
                                <div class="col">
                                    <div class="h3 mb-0 text-primary">500+</div>
                                    <div class="text-muted small">Organizations</div>
                                </div>
                                <div class="col border-start">
                                    <div class="h3 mb-0 text-success">73%</div>
                                    <div class="text-muted small">Avg. Risk Reduction</div>
                                </div>
                                <div class="col border-start">
                                    <div class="h3 mb-0 text-info">24/7</div>
                                    <div class="text-muted small">Monitoring</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Feature Highlights -->
                <div class="row g-3 mb-4">
                    <div class="col-md-4">
                        <div class="card feature-card h-100">
                            <div class="card-body text-center py-4">
                                <svg class="icon mb-3" width="40" height="40" viewBox="0 0 24 24" stroke-width="1.5" stroke="#2fb344" fill="none">
                                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                                    <path d="M9 12l2 2 4-4"></path>
                                </svg>
                                <h4 class="card-title h5 mb-2">Real-Time Protection</h4>
                                <p class="text-muted small mb-0">Continuous monitoring with instant threat alerts and automated responses</p>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="card feature-card h-100">
                            <div class="card-body text-center py-4">
                                <svg class="icon mb-3" width="40" height="40" viewBox="0 0 24 24" stroke-width="1.5" stroke="#667eea" fill="none">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                    <polyline points="14 2 14 8 20 8"></polyline>
                                    <line x1="12" y1="18" x2="12" y2="12"></line>
                                    <line x1="9" y1="15" x2="15" y2="15"></line>
                                </svg>
                                <h4 class="card-title h5 mb-2">Compliance Ready</h4>
                                <p class="text-muted small mb-0">SOC 2, GDPR, HIPAA, and industry standards with automated reporting</p>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="card feature-card h-100">
                            <div class="card-body text-center py-4">
                                <svg class="icon mb-3" width="40" height="40" viewBox="0 0 24 24" stroke-width="1.5" stroke="#764ba2" fill="none">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <path d="M12 16v-4"></path>
                                    <path d="M12 8h.01"></path>
                                    <path d="M8 12h8"></path>
                                </svg>
                                <h4 class="card-title h5 mb-2">AI-Driven Insights</h4>
                                <p class="text-muted small mb-0">Machine learning for predictive threat detection and risk analysis</p>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="text-center mt-2">
                    <div class="d-flex justify-content-center align-items-center gap-3 text-muted" style="font-size: 12px;">
                        <div class="d-flex align-items-center trust-badge">
                            <svg class="icon me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none">
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                            </svg>
                            <span>256-bit Encryption</span>
                        </div>
                        <div class="d-flex align-items-center trust-badge">
                            <svg class="icon me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none">
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                            </svg>
                            <span>SOC 2 Compliant</span>
                        </div>
                        <div class="d-flex align-items-center trust-badge">
                            <svg class="icon me-1" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                                <line x1="9" y1="15" x2="15" y2="15"></line>
                            </svg>
                            <span>GDPR Ready</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}
