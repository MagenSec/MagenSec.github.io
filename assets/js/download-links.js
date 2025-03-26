function displayDownloadLinks() {
    const userAgent = navigator.userAgent;
    const isWindows = userAgent.includes("Windows");
    const isIntelAMD64 = userAgent.includes("x64") || userAgent.includes("amd64");
    const isARM64 = userAgent.includes("arm64") || userAgent.includes("aarch64");
  
    const intelAMD64Div = document.getElementById("intelAMD64");
    const arm64Div = document.getElementById("arm64");
  
    if (isWindows) {
      if (isIntelAMD64) {
        // Show Intel/AMD64 button, ARM64 link
        if (intelAMD64Div) {
          intelAMD64Div.innerHTML = '<button class="download-button" onclick="window.location.href=\'' + intelAMD64Div.querySelector('a').href + '\'">Download Windows x64</button>';
          arm64Div.style.display = "block";
        }
      } else if (isARM64) {
        // Show ARM64 button, Intel/AMD64 link
        if (arm64Div) {
          arm64Div.innerHTML = '<button class="download-button" onclick="window.location.href=\'' + arm64Div.querySelector('a').href + '\'">Download Windows ARM64</button>';
          intelAMD64Div.style.display = "block";
        }
      } else {
        // Show both as links
        if (intelAMD64Div) {
          intelAMD64Div.style.display = "block";
        }
        if (arm64Div) {
          arm64Div.style.display = "block";
        }
      }
    } else {
      // Show all links if not Windows
      if (intelAMD64Div) {
        intelAMD64Div.style.display = "block";
      }
      if (arm64Div) {
        arm64Div.style.display = "block";
      }
    }
  }
  
  window.onload = displayDownloadLinks;