# MagenSec Admin Dashboard - Strategic Plan

## 1. Vision & Creative Direction

**Concept: The Security Command Center**

Our goal is to create more than just a data portal; we will build a **Security Command Center**. This experience will be designed for clarity, insight, and action. It will provide both at-a-glance situational awareness for executives and deep-dive capabilities for security analysts.

**Design Philosophy:**

*   **Modern & Clean:** A minimalist UI that prioritizes data visualization over clutter. We will use a fluid layout, responsive design, and a professional color palette (utilizing blues, greys, with accents of green for "secure" and red/orange for "at-risk").
*   **Data-Driven Storytelling:** We won't just show numbers. We will use charts and KPIs to tell a story about the organization's security posture, risk exposure, and asset landscape over time.
*   **Action-Oriented:** The interface will guide users toward identifying and addressing the most critical issues first.

**Technology:**

*   **Framework:** We will build upon the existing vanilla JS structure, enhanced with **ApexCharts.js** (already included) for rich, interactive, and animated visualizations. This keeps the site lightweight and fast, avoiding heavy frameworks.
*   **Styling:** We will enhance `admin.css` to implement the modern design, ensuring responsiveness for various screen sizes.

## 2. Architectural Blueprint

1.  **Authentication:** The existing `auth.js` and `teamList.json` system is sound. It correctly isolates tenants (orgs) and provides an admin override. This will be preserved and built upon.
2.  **Data Service (`dataService.js`):**
    *   **SAS Token Integration:** We will integrate the key decoding logic from `keyMaterial.js` directly into the data service's initialization, so SAS tokens are loaded and ready automatically.
    *   **Intelligent Caching:** The existing 5-minute TTL cache is a good start. We will implement a more robust local cache using `sessionStorage` or `localStorage` to hold data between view changes, reducing redundant downloads. Data will be refreshed on a timer or manually.
    *   **Data Pre-processing:** Upon fetching, data will be pre-processed and aggregated into a format optimized for visualization to ensure the UI remains snappy.
3.  **Modular Views:** The current view-based architecture (`*View.js`) is excellent. We will continue this pattern, ensuring each view is self-contained and responsible for rendering a specific slice of data.

## 3. Execution Roadmap

### Phase 1: The Command Center Dashboard (`dashboardView.js`)

This is the heart of the experience, providing a 360-degree view of security posture.

*   **KPIs (Key Performance Indicators):**
    *   **Overall Security Score:** A large, animated gauge chart (0-100). Calculated from device compliance, vulnerability density, and exploitability.
    *   **Asset Inventory:** Simple counts of Managed Devices and Unique Applications.
    *   **Vulnerability Overview:** A donut chart showing a breakdown of apps by Critical, High, and Medium risk.
    *   **High-Risk Assets:** A card highlighting the number of devices with high-probability exploits.
*   **Visualizations:**
    *   **Security Posture Over Time:** A timeline chart showing the security score over the last 30 days.
    *   **Top 5 Riskiest Applications:** A bar chart listing the applications with the highest `ExploitProbability`.

### Phase 2: Application Intelligence (`appsView.js`)

A deep dive into the software landscape.

*   **Primary View:** A rich, filterable data table of all discovered applications.
*   **Key Data Points:** App Name, Vendor, Version, # of Installs, Vulnerability Status, Exploit Probability.
*   **Interactivity:**
    *   **Filtering:** Filter by name, vulnerability status, or `MatchType`.
    *   **Drill-Down:** Clicking an app reveals the list of devices it's installed on.

### Phase 3: Device Fleet Management (`installsView.js`)

Understanding the hardware and OS landscape.

*   **Primary View:** A card-based or table view of all managed devices.
*   **Key Data Points:** Device Name, OS Version, Key security settings (from `InstallTelemetry`).
*   **KPIs:** OS Distribution (pie chart), Devices Missing Critical Patches.

### Phase 4: Modernized Reporting (`reportsView.js`)

Transform the existing reports view into a powerful, interactive reporting engine.

*   **Features:**
    *   Implement the modular filters and animated KPI cards as per the existing TODO.
    *   Add "Export to PDF" and "Export to CSV" functionality for all tables and charts.
    *   Create pre-canned reports like "Monthly Vulnerability Summary" and "Asset Inventory Report".

### Phase 5: Admin Cross-Org View (`adminView.js`)

The view for the MagenSec business owner.

*   **Org Selector:** A dropdown to switch between viewing a specific customer's dashboard and the aggregate view.
*   **Aggregate KPIs:** Show total devices, total vulnerabilities, and average security score across all customers.
*   **Customer Health Table:** A list of all organizations with their overall security score, allowing the admin to quickly identify customers at risk.

This plan provides a clear path forward to creating a professional, valuable, and delightful security experience. We will begin with **Phase 1: The Command Center Dashboard**.
