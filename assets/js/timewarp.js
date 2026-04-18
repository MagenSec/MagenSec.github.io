(function () {
    var dates = [
        { date: "Jun 15, 2024", action: "Rewinding to Q2 2024..." },
        { date: "Aug 21, 2024", action: "Rewinding to Aug 2024..." },
        { date: "Sep 15, 2024", action: "Q3 Posture Report Ready" },
        { date: "Oct 31, 2024", action: "Rewinding to Oct 2024..." },
        { date: "Dec 01, 2024", action: "Snapshot: Dec 2024 — Compliant" },
        { date: "Jan 15, 2025", action: "Rewinding to Q1 2025..." },
        { date: "Mar 10, 2025", action: "Q1 Proof Report Ready" }
    ];
    var stats = ["Rewinding\u2026", "Scanning\u2026", "Locked In", "Verified", "Rewinding\u2026"];
    var i = 0, s = 0;

    function fade(id, txt) {
        var el = document.getElementById(id);
        if (!el) return;
        el.style.opacity = "0";
        el.style.transition = "opacity 0.35s";
        setTimeout(function () { el.textContent = txt; el.style.opacity = "1"; }, 350);
    }

    setInterval(function () {
        i = (i + 1) % dates.length;
        var d = dates[i];
        fade("timewarp-date", d.date);
        fade("timewarp-action", d.action);
        var st = document.getElementById("timewarp-status");
        if (st) st.textContent = stats[s++ % stats.length];
    }, 2500);
})();
