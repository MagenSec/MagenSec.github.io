(function () {
    var dates = [
        { date: "Jun 15, 2024", action: "Opening Q2 evidence..." },
        { date: "Aug 21, 2024", action: "Opening August evidence..." },
        { date: "Sep 15, 2024", action: "Q3 posture report ready" },
        { date: "Oct 31, 2024", action: "Opening October evidence..." },
        { date: "Dec 01, 2024", action: "Captured state: Dec 2024 compliant" },
        { date: "Jan 15, 2025", action: "Opening Q1 evidence..." },
        { date: "Mar 10, 2025", action: "Q1 evidence report ready" }
    ];
    var stats = ["Opening\u2026", "Checking evidence\u2026", "Locked In", "Verified", "Opening\u2026"];
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
