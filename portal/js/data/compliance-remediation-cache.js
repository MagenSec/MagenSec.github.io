/**
 * Pre-populated remediation guidance for all 77 compliance controls.
 * Loaded in memory for instant cache-first lookup before hitting MAGI AI.
 *
 * Key = controlId (matches compliance-controls.json)
 * Value = markdown remediation string
 */

/* eslint-disable max-len */
export const complianceRemediationCache = {

    // ── Antivirus ───────────────────────────────────────────────────────────

    "AV-001-RTP": `## Why This Matters
Real-Time Protection continuously scans files, downloads, and programs for malware as they are accessed. Without it your system only detects threats during manual or scheduled scans — leaving a wide window for malware to execute.

## Risks if Left Unresolved
- Malware, ransomware, and trojans can execute undetected between scans
- Compromised files can spread laterally before the next scheduled scan
- Non-compliant with CIS 10.1, NIST PR.PS-01, ISO 27001 A.8.7, and CERT-IN EP.1

## Step-by-Step Remediation
1. Open **Windows Security** → **Virus & threat protection** → **Virus & threat protection settings**
2. Toggle **Real-time protection** to **On**
3. If the toggle is greyed out, check that Group Policy isn't overriding it:
   - Run \`gpedit.msc\` → Computer Configuration → Administrative Templates → Windows Components → Microsoft Defender Antivirus → Real-time Protection
   - Set **Turn off real-time protection** to **Not Configured**
4. Verify with PowerShell: \`Get-MpComputerStatus | Select RealTimeProtectionEnabled\`
5. Confirm the value is **True**`,

    "AV-002-FW": `## Why This Matters
Windows Firewall is the first line of defence against unauthorized network traffic. It filters inbound and outbound connections on all network profiles (Public, Private, Domain).

## Risks if Left Unresolved
- Unauthorised inbound connections can exploit open services
- Outbound C2 (command & control) traffic from malware goes unchecked
- Non-compliant with CIS 12.2, NIST PR.PS-04, ISO 27001 A.8.20

## Step-by-Step Remediation
1. Open **Windows Security** → **Firewall & network protection**
2. Ensure all profiles (Domain, Private, Public) show **Firewall is on**
3. If disabled via Group Policy:
   - \`gpedit.msc\` → Computer Configuration → Windows Settings → Security Settings → Windows Defender Firewall with Advanced Security
   - Set each profile's Firewall State to **On**
4. PowerShell verification: \`Get-NetFirewallProfile | Select Name, Enabled\`
5. All profiles should show **Enabled = True**`,

    "AV-003-TMR": `## Why This Matters
Tamper Protection prevents malware and malicious actors from disabling Windows Defender protections (real-time scanning, cloud protection, behaviour monitoring) through registry edits, scripts, or Group Policy.

## Risks if Left Unresolved
- Sophisticated malware routinely disables Defender as its first action
- Without Tamper Protection, security features can be silently turned off
- Non-compliant with CIS 10.5, NIST PR.PS-01, ISO 27001 A.8.7

## Step-by-Step Remediation
1. Open **Windows Security** → **Virus & threat protection** → **Virus & threat protection settings**
2. Scroll to **Tamper Protection** and toggle it **On**
3. If managed by Intune/MDE, configure it in the Microsoft Defender portal → Settings → Endpoints → Advanced Features → Tamper Protection
4. Note: Tamper Protection cannot be enabled via Group Policy by design — it must be toggled in Windows Security or via cloud management
5. Verify with PowerShell: \`Get-MpComputerStatus | Select IsTamperProtected\` — should return **True**`,

    "AV-004-CLD": `## Why This Matters
Cloud-Delivered Protection (Microsoft MAPS) sends suspicious file metadata to Microsoft's cloud for real-time analysis. This enables detection of zero-day threats that local signatures haven't catalogued yet.

## Risks if Left Unresolved
- New and emerging threats bypass local signature-only detection
- Reduced protection against zero-day exploits and polymorphic malware
- Non-compliant with CIS 10.1, NIST DE.CM-09

## Step-by-Step Remediation
1. Open **Windows Security** → **Virus & threat protection** → **Virus & threat protection settings**
2. Toggle **Cloud-delivered protection** to **On**
3. If managed via Group Policy:
   - \`gpedit.msc\` → Computer Configuration → Administrative Templates → Windows Components → Microsoft Defender Antivirus → MAPS
   - Set **Join Microsoft MAPS** to **Enabled** → **Advanced MAPS**
4. PowerShell: \`Set-MpPreference -MAPSReporting Advanced\`
5. Verify: \`Get-MpPreference | Select MAPSReporting\` — value should be **2** (Advanced)`,

    // ── Network ─────────────────────────────────────────────────────────────

    "NET-001-RDP": `## Why This Matters
Remote Desktop Protocol (RDP) is one of the most targeted attack vectors. Exposed RDP services are routinely brute-forced, credential-stuffed, and exploited via known vulnerabilities (e.g., BlueKeep).

## Risks if Left Unresolved
- Brute-force attacks on RDP credentials
- Exploitation of RDP vulnerabilities for remote code execution
- Lateral movement after initial compromise
- Non-compliant with CIS 4.8, NIST PR.AA-05

## Step-by-Step Remediation
1. Open **Settings** → **System** → **Remote Desktop** → toggle **Off**
2. Or via Registry: set \`HKLM\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server\\fDenyTSConnections\` to **1**
3. PowerShell: \`Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server' -Name "fDenyTSConnections" -Value 1\`
4. If remote access is required, use a VPN or Zero Trust solution instead of exposing RDP directly
5. Verify: \`(Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server').fDenyTSConnections\` should be **1**`,

    "NET-002-PRT": `## Why This Matters
High-risk ports (FTP/21, SSH/22, Telnet/23, SMTP/25, NetBIOS/137-139, SMB/445, VNC/5900, WinRM/5985-5986) listening on wildcard addresses expose services to the entire network or internet.

## Risks if Left Unresolved
- Attack surface expansion — each open port is a potential entry point
- Services like Telnet transmit credentials in cleartext
- SMB exposure enables ransomware propagation (WannaCry, NotPetya)
- Non-compliant with CIS 4.4, NIST DE.CM-01

## Step-by-Step Remediation
1. Identify listening ports: \`netstat -an | findstr LISTENING\`
2. Disable unnecessary services: \`Stop-Service <ServiceName>; Set-Service <ServiceName> -StartupType Disabled\`
3. For required services, bind to specific interfaces instead of 0.0.0.0
4. Block high-risk ports in Windows Firewall: \`New-NetFirewallRule -DisplayName "Block Telnet" -Direction Inbound -LocalPort 23 -Protocol TCP -Action Block\`
5. Re-scan to verify: \`Test-NetConnection -ComputerName localhost -Port 23\` should fail`,

    "NET-003-SEG": `## Why This Matters
Network segmentation isolates critical assets into separate zones, limiting lateral movement if an attacker gains access to one segment.

## Risks if Left Unresolved
- A single compromised endpoint can reach all network resources
- Ransomware can propagate across the entire flat network
- Non-compliant with CIS 12.2, NIST PR.IR-01

## Step-by-Step Remediation
1. Identify critical asset groups (servers, workstations, IoT, guest)
2. Create VLANs or subnets for each group
3. Configure firewall rules between segments — deny by default, allow only required traffic
4. Use Windows Firewall profiles or network ACLs to enforce segmentation at the host level
5. Test by attempting connections across segments — only explicitly allowed paths should succeed`,

    "NET-004-VPN": `## Why This Matters
Secure remote access via VPN ensures all remote traffic is encrypted and authenticated before reaching internal resources. Without it, sensitive data traverses untrusted networks in the clear.

## Risks if Left Unresolved
- Credential theft via man-in-the-middle attacks on public networks
- Unauthorized access to internal resources
- Non-compliant with CIS 12.7, ISO 27001 A.8.24

## Step-by-Step Remediation
1. Deploy a reputable VPN solution (WireGuard, OpenVPN, or a managed service)
2. Require MFA for VPN authentication
3. Enforce split-tunnel or full-tunnel policies based on security requirements
4. Disable direct RDP/SSH access — require VPN-first connectivity
5. Audit VPN logs regularly for unusual connection patterns`,

    "NET-005-NBT": `## Why This Matters
NetBIOS over TCP/IP is a legacy protocol that enables name resolution and file sharing. It broadcasts system information on the network and is exploited for enumeration and relay attacks.

## Risks if Left Unresolved
- Network enumeration reveals hostnames, users, and shares
- NBNS poisoning enables credential capture (Responder/MITM attacks)
- Non-compliant with CIS 9.2, NIST PR.PS-01

## Step-by-Step Remediation
1. Open **Network Connections** → right-click adapter → **Properties** → **Internet Protocol Version 4** → **Advanced** → **WINS** tab
2. Select **Disable NetBIOS over TCP/IP**
3. Registry: set \`HKLM\\SYSTEM\\CurrentControlSet\\Services\\NetBT\\Parameters\\Interfaces\\<ID>\\NetbiosOptions\` to **2**
4. For all adapters via PowerShell: \`Get-WmiObject Win32_NetworkAdapterConfiguration | Where { $_.TcpipNetbiosOptions -ne 2 } | ForEach { $_.SetTcpipNetbios(2) }\`
5. Verify: \`nbtstat -n\` should show no registered names`,

    "NET-006-LNK": `## Why This Matters
Link-Local Multicast Name Resolution (LLMNR) is a fallback name resolution protocol. Attackers use tools like Responder to answer LLMNR queries and capture NTLMv2 hashes for offline cracking.

## Risks if Left Unresolved
- LLMNR/NBT-NS poisoning captures credentials on the local network
- Captured NTLMv2 hashes can be cracked offline or relayed
- Non-compliant with CIS 9.3.7, NIST PR.PS-01

## Step-by-Step Remediation
1. Group Policy: \`gpedit.msc\` → Computer Configuration → Administrative Templates → Network → DNS Client
2. Set **Turn off multicast name resolution** to **Enabled**
3. Registry: \`Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\DNSClient' -Name 'EnableMulticast' -Value 0 -Type DWord\`
4. Also disable NBT-NS (see NET-005-NBT) for complete multicast name resolution lockdown
5. Verify with \`Resolve-DnsName -LlmnrOnly testhost\` — should fail`,

    "NET-007-WRM": `## Why This Matters
Windows Remote Management (WinRM) enables remote command execution via PowerShell. If enabled unnecessarily, it provides a powerful lateral movement vector for attackers.

## Risks if Left Unresolved
- Attackers can execute commands remotely on compromised accounts
- WinRM over HTTP transmits data (including credentials) in cleartext
- Non-compliant with CIS 4.8, NIST PR.AA-05

## Step-by-Step Remediation
1. Check status: \`Get-Service WinRM | Select Status, StartType\`
2. Disable the service: \`Stop-Service WinRM; Set-Service WinRM -StartupType Disabled\`
3. If WinRM is required for management, restrict to HTTPS only and limit trusted hosts
4. Block WinRM ports (5985/5986) in firewall for unapproved source IPs
5. Verify: \`Test-WSMan\` should fail with a connection error`,

    "NET-008-RAS": `## Why This Matters
Remote Assistance allows another user to view or control your desktop. If enabled, it can be exploited for social engineering attacks or unauthorized screen sharing.

## Risks if Left Unresolved
- Social engineering attacks can trick users into granting remote control
- Unsolicited Remote Assistance enables passive screen monitoring
- Non-compliant with CIS 18.9.75.1

## Step-by-Step Remediation
1. Open **System Properties** → **Remote** tab → uncheck **Allow Remote Assistance connections to this computer**
2. Group Policy: \`gpedit.msc\` → Computer Configuration → Administrative Templates → System → Remote Assistance
3. Set **Configure Solicited Remote Assistance** to **Disabled**
4. Registry: \`Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Remote Assistance' -Name 'fAllowToGetHelp' -Value 0\`
5. Verify the setting is disabled in System Properties → Remote tab`,

    "NET-009-REG": `## Why This Matters
The Remote Registry service allows remote access to the Windows registry. Attackers can enumerate security settings, installed software, and credentials stored in registry hives.

## Risks if Left Unresolved
- Remote enumeration of security configuration and credentials
- Modification of security settings by compromised accounts
- Non-compliant with CIS 5.27

## Step-by-Step Remediation
1. Check status: \`Get-Service RemoteRegistry | Select Status, StartType\`
2. Disable: \`Stop-Service RemoteRegistry; Set-Service RemoteRegistry -StartupType Disabled\`
3. Group Policy: \`gpedit.msc\` → Windows Settings → Security Settings → System Services → Remote Registry → set to **Disabled**
4. Firewall: block inbound port 445 from untrusted sources (Remote Registry uses SMB)
5. Verify: \`Get-Service RemoteRegistry | Select StartType\` should show **Disabled**`,

    "NET-010-SPL": `## Why This Matters
The Print Spooler service has been the target of critical RCE vulnerabilities (PrintNightmare / CVE-2021-34527). On systems that don't need printing, it should be disabled.

## Risks if Left Unresolved
- PrintNightmare and related vulnerabilities allow remote code execution with SYSTEM privileges
- Spooler can be exploited for privilege escalation and lateral movement
- Non-compliant with CIS 5.36

## Step-by-Step Remediation
1. Check if printing is needed on this machine; if not, disable the service
2. \`Stop-Service Spooler; Set-Service Spooler -StartupType Disabled\`
3. Group Policy: \`gpedit.msc\` → Computer Configuration → Administrative Templates → Printers → set **Allow Print Spooler to accept client connections** to **Disabled**
4. If printing is required, install latest patches and restrict spooler to local connections only
5. Verify: \`Get-Service Spooler | Select StartType\` should show **Disabled**`,

    // ── OS Hardening ────────────────────────────────────────────────────────

    "OS-001-SBT": `## Why This Matters
Secure Boot validates that bootloaders and kernel drivers are signed by trusted certificates. It prevents bootkits and rootkits from loading before the operating system.

## Risks if Left Unresolved
- Rootkits can persist below the OS level, invisible to antimalware
- Boot-level malware survives OS reinstallation
- Non-compliant with CIS 1.1.1, NIST PR.PS-01

## Step-by-Step Remediation
1. Check current status: \`Confirm-SecureBootUEFI\` — should return **True**
2. If not enabled, reboot into UEFI/BIOS settings (usually F2/F12/DEL at startup)
3. Navigate to **Security** or **Boot** → enable **Secure Boot**
4. The disk must use GPT partition style (not MBR). Verify: \`Get-Disk | Select PartitionStyle\`
5. If MBR, convert to GPT: \`MBR2GPT /validate /disk:0\` then \`MBR2GPT /convert /disk:0\` (back up first)`,

    "OS-002-BLK": `## Why This Matters
BitLocker encrypts the entire drive, protecting data at rest if the device is lost or stolen. Without it, anyone with physical access can read the drive by mounting it externally.

## Risks if Left Unresolved
- Data exposure from lost/stolen laptops — no encryption means full data access
- Regulatory violations (GDPR, HIPAA, PCI-DSS require encryption at rest)
- Non-compliant with CIS 6.2, NIST PR.DS-01

## Step-by-Step Remediation
1. Verify TPM is present: \`Get-Tpm | Select TpmPresent, TpmEnabled\`
2. Enable BitLocker: \`Enable-BitLocker -MountPoint "C:" -EncryptionMethod XtsAes256 -UsedSpaceOnly -TpmProtector\`
3. Add a recovery key: \`Manage-bde -protectors -add C: -RecoveryPassword\`
4. Back up the recovery key to a safe location (AD, Azure AD, or secure storage)
5. Verify status: \`Get-BitLockerVolume | Select MountPoint, ProtectionStatus, EncryptionPercentage\``,

    "OS-003-AUP": `## Why This Matters
Automatic Updates ensure the system receives critical security patches as soon as they are released. Delayed patching is one of the primary causes of successful cyberattacks.

## Risks if Left Unresolved
- Known vulnerabilities remain unpatched and exploitable
- Zero-day exploits get weaponized faster than manual patching cycles
- Non-compliant with CIS 3.4, NIST PR.PS-01

## Step-by-Step Remediation
1. Open **Settings** → **Windows Update** → **Advanced options**
2. Ensure **Receive updates for other Microsoft products** is enabled
3. Set active hours to avoid disruption, but don't defer security updates
4. Group Policy: \`gpedit.msc\` → Computer Configuration → Administrative Templates → Windows Components → Windows Update → set **Configure Automatic Updates** to **Enabled** → **4 - Auto download and schedule the install**
5. Verify: \`Get-WindowsUpdateLog\` or check Windows Update history for recent installs`,

    "OS-004-UAC": `## Why This Matters
User Account Control (UAC) prevents unauthorized changes by requiring elevation for administrative actions. It limits the blast radius of malware running in user context.

## Risks if Left Unresolved
- Malware runs with full admin privileges without user consent
- Silent software installation and system modification
- Non-compliant with CIS 17.9.4, NIST PR.AC-06

## Step-by-Step Remediation
1. Open **Control Panel** → **User Accounts** → **Change User Account Control settings**
2. Set the slider to **Always notify** (highest level)
3. Registry: set \`HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System\\EnableLUA\` to **1**
4. Registry: set \`ConsentPromptBehaviorAdmin\` to **2** (prompt for consent on the secure desktop)
5. Verify: \`(Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System').EnableLUA\` should be **1**`,

    "OS-005-SMB": `## Why This Matters
SMBv1 is a deprecated protocol with critical vulnerabilities. EternalBlue (used by WannaCry and NotPetya) exploits SMBv1 to achieve remote code execution.

## Risks if Left Unresolved
- Exploitation via EternalBlue and related SMBv1 vulnerabilities
- Ransomware propagation across the network
- Non-compliant with CIS 9.3.10, NIST PR.PS-01

## Step-by-Step Remediation
1. Check if SMBv1 is enabled: \`Get-WindowsOptionalFeature -Online -FeatureName SMB1Protocol | Select State\`
2. Disable: \`Disable-WindowsOptionalFeature -Online -FeatureName SMB1Protocol -NoRestart\`
3. Alternatively via PowerShell: \`Set-SmbServerConfiguration -EnableSMB1Protocol $false -Force\`
4. Restart the computer to complete the removal
5. Verify: \`Get-SmbServerConfiguration | Select EnableSMB1Protocol\` should be **False**`,

    "OS-006-NLA": `## Why This Matters
Network Level Authentication (NLA) requires users to authenticate before a full RDP session is established. Without NLA, the RDP service is exposed to pre-authentication attacks.

## Risks if Left Unresolved
- Remote Desktop login screen exposed to unauthenticated users
- Denial-of-service attacks against the RDP service
- Non-compliant with CIS 18.9.65.3.9.1

## Step-by-Step Remediation
1. Open **System Properties** → **Remote** tab → check **Allow connections only from computers running Remote Desktop with Network Level Authentication**
2. Registry: set \`HKLM\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server\\WinStations\\RDP-Tcp\\UserAuthentication\` to **1**
3. PowerShell: \`Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server\\WinStations\\RDP-Tcp' -Name 'UserAuthentication' -Value 1\`
4. If RDP is disabled entirely (recommended per NET-001-RDP), NLA is moot but should still be configured as defence-in-depth
5. Verify the registry value is **1**`,

    "OS-007-PSL": `## Why This Matters
PowerShell Script Block Logging records the content of all PowerShell scripts executed on the system. This is essential for detecting and investigating fileless malware and living-off-the-land attacks.

## Risks if Left Unresolved
- PowerShell-based attacks (Empire, Cobalt Strike) evade detection
- No forensic evidence of script execution during incident response
- Non-compliant with CIS 18.9.100.1

## Step-by-Step Remediation
1. Group Policy: \`gpedit.msc\` → Computer Configuration → Administrative Templates → Windows Components → Windows PowerShell
2. Enable **Turn on PowerShell Script Block Logging**
3. Registry: \`Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\PowerShell\\ScriptBlockLogging' -Name 'EnableScriptBlockLogging' -Value 1\`
4. Logs appear in Event Viewer → Applications and Services Logs → Microsoft → Windows → PowerShell → Operational
5. Configure log forwarding to your SIEM for centralized monitoring`,

    "OS-008-ARP": `## Why This Matters
AutoRun/AutoPlay automatically executes programs from removable media (USB drives, CDs). Malware frequently spreads via infected USB drives that auto-launch payloads.

## Risks if Left Unresolved
- USB-based malware auto-executes on insertion
- BadUSB attacks exploit AutoRun for initial compromise
- Non-compliant with CIS 18.9.13.1

## Step-by-Step Remediation
1. Group Policy: \`gpedit.msc\` → Computer Configuration → Administrative Templates → Windows Components → AutoPlay Policies
2. Set **Turn off AutoPlay** to **Enabled** → **All drives**
3. Registry: \`Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer' -Name 'NoDriveTypeAutoRun' -Value 255\`
4. Also disable AutoRun: \`Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\Explorer' -Name 'NoAutorun' -Value 1\`
5. Verify in Group Policy editor that AutoPlay is disabled for all drives`,

    "OS-009-LSA": `## Why This Matters
LSA Process Protection (PPL) prevents unauthorized code from injecting into LSASS (Local Security Authority Subsystem Service), which stores credentials in memory. Tools like Mimikatz target LSASS to extract passwords.

## Risks if Left Unresolved
- Credential theft via LSASS memory dumps (Mimikatz, ProcDump)
- Harvested credentials enable lateral movement and privilege escalation
- Non-compliant with CIS 18.4.7, NIST PR.AC-01

## Step-by-Step Remediation
1. Registry: \`Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Lsa' -Name 'RunAsPPL' -Value 1 -Type DWord\`
2. Restart the computer for the change to take effect
3. Verify LSASS is running as PPL: \`Get-Process lsass | Select ProcessName, @{N='PPL';E={(Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Lsa').RunAsPPL}}\`
4. If using Credential Guard (OS-011-CGR), it provides even stronger protection
5. Monitor Event Log for LSA protection events (Event ID 3033, 3063)`,

    "OS-010-DEP": `## Why This Matters
Data Execution Prevention (DEP) marks memory regions as non-executable, preventing buffer overflow exploits from executing shellcode in data segments.

## Risks if Left Unresolved
- Buffer overflow exploits can execute arbitrary code in memory
- Shellcode injection becomes easier without DEP enforcement
- Non-compliant with CIS 1.1.2, NIST PR.PS-01

## Step-by-Step Remediation
1. Check status: \`bcdedit /query | findstr "nx"\` — should show **OptIn** or **AlwaysOn**
2. Enable for all programs: \`bcdedit /set nx AlwaysOn\`
3. For maximum protection, verify in **System Properties** → **Advanced** → **Performance Settings** → **Data Execution Prevention** tab → **Turn on DEP for all programs**
4. If specific legacy applications fail, add them as exceptions (not recommended for security-sensitive systems)
5. Restart required for changes to take effect`,

    "OS-011-CGR": `## Why This Matters
Credential Guard uses virtualization-based security (VBS) to isolate LSASS secrets in a protected container. Even if the OS kernel is compromised, credentials remain protected.

## Risks if Left Unresolved
- Credential theft attacks (pass-the-hash, pass-the-ticket) succeed without VBS isolation
- Mimikatz and similar tools can dump credentials from unprotected LSASS
- Non-compliant with CIS 18.4.5.1

## Step-by-Step Remediation
1. Requirements: Windows 10/11 Enterprise or Education, UEFI Secure Boot, TPM 2.0
2. Enable via Group Policy: \`gpedit.msc\` → Computer Configuration → Administrative Templates → System → Device Guard → **Turn on Virtualization Based Security** → Enabled
3. Set **Credential Guard Configuration** to **Enabled with UEFI lock**
4. PowerShell verification: \`Get-CimInstance -ClassName Win32_DeviceGuard -Namespace root\\Microsoft\\Windows\\DeviceGuard | Select SecurityServicesRunning\`
5. Value should include **1** (Credential Guard)`,

    "OS-012-SMR": `## Why This Matters
Windows SmartScreen checks downloaded files and applications against Microsoft's reputation database. It warns users before running unrecognized or potentially malicious executables.

## Risks if Left Unresolved
- Users can run malware without any warning prompt
- Phishing payloads execute without SmartScreen's reputation check
- Non-compliant with CIS 18.9.85.1.1

## Step-by-Step Remediation
1. Open **Windows Security** → **App & browser control** → **Reputation-based protection settings**
2. Enable all SmartScreen options: **Check apps and files**, **SmartScreen for Microsoft Edge**, **Potentially unwanted app blocking**
3. Group Policy: \`gpedit.msc\` → Computer Configuration → Administrative Templates → Windows Components → Windows Defender SmartScreen → Explorer → **Configure Windows Defender SmartScreen** → **Enabled** → **Warn and prevent bypass**
4. Registry: \`Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer' -Name 'SmartScreenEnabled' -Value 'RequireAdmin'\`
5. Verify SmartScreen is active in Windows Security settings`,

    "OS-013-WDG": `## Why This Matters
WDigest stores plaintext credentials in memory for backwards compatibility with legacy authentication. Attackers can dump these cleartext passwords with tools like Mimikatz.

## Risks if Left Unresolved
- Plaintext passwords available in LSASS memory for credential harvesting
- Any user's password on the system is at risk after compromise
- Non-compliant with CIS 18.4.8, NIST PR.AC-01

## Step-by-Step Remediation
1. Registry: \`Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\SecurityProviders\\WDigest' -Name 'UseLogonCredential' -Value 0 -Type DWord\`
2. This change takes effect immediately (no restart needed for new logons)
3. Existing sessions may still have cached credentials until logoff
4. Verify: \`(Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\SecurityProviders\\WDigest').UseLogonCredential\` should be **0**
5. Combine with Credential Guard (OS-011-CGR) for maximum credential protection`,

    // ── Identity & Access ───────────────────────────────────────────────────

    "IAM-001-MFA": `## Why This Matters
Multi-Factor Authentication adds a second verification step beyond passwords. It prevents account compromise even when passwords are leaked or cracked.

## Risks if Left Unresolved
- Compromised passwords grant immediate access without additional verification
- Phishing attacks succeed without MFA challenge
- Non-compliant with CIS 5.2, NIST PR.AA-01, ISO 27001 A.8.5

## Step-by-Step Remediation
1. For Microsoft accounts: **Settings** → **Accounts** → **Sign-in options** → set up Windows Hello (PIN, fingerprint, or face)
2. For Azure AD: Enable MFA per-user or via Conditional Access in Azure Portal
3. For local accounts: Deploy a third-party MFA solution (Duo, Okta, etc.)
4. Require MFA for all privileged accounts first, then roll out to all users
5. Register backup authentication methods (phone, authenticator app, hardware key)`,

    "IAM-002-PWD": `## Why This Matters
A strong password policy prevents brute-force attacks and credential guessing. Minimum length, complexity, and history requirements significantly increase attack difficulty.

## Risks if Left Unresolved
- Simple passwords cracked quickly via dictionary or brute-force attacks
- Password reuse across accounts enables credential stuffing
- Non-compliant with CIS 5.4.1, NIST PR.AA-01

## Step-by-Step Remediation
1. Open \`secpol.msc\` → Account Policies → Password Policy
2. Set **Minimum password length**: 14 characters
3. Set **Password must meet complexity requirements**: Enabled
4. Set **Enforce password history**: 24 passwords remembered
5. Consider passwordless options (Windows Hello, FIDO2 keys) for superior security`,

    "IAM-003-PAM": `## Why This Matters
Privileged Access Management ensures admin accounts are used only when necessary, with additional controls like just-in-time access and session recording.

## Risks if Left Unresolved
- Admin accounts used for daily work increase attack surface
- Compromised admin credentials grant full system control
- Non-compliant with CIS 5.4, NIST PR.AA-05

## Step-by-Step Remediation
1. Create separate admin accounts for privileged tasks (never use admin for daily work)
2. Implement least-privilege: only assign admin rights when needed
3. Use \`runas\` or separate admin sessions for privileged operations
4. Enable Local Administrator Password Solution (LAPS) for unique local admin passwords
5. Audit privileged account usage regularly via Security Event Logs (Event ID 4672)`,

    "IAM-004-SRP": `## Why This Matters
Separation of Duties ensures no single user has unchecked control over critical functions. It prevents both accidental and malicious misuse of combined privileges.

## Risks if Left Unresolved
- Single points of failure in access control
- Insider threats amplified by excessive privilege combination
- Non-compliant with ISO 27001 A.5.3, NIST PR.AA-05

## Step-by-Step Remediation
1. Review all user roles and identify overlapping critical permissions
2. Separate administrative functions: different accounts for backup, security, and domain admin
3. Implement approval workflows for high-risk operations
4. Use group-based permissions rather than individual user assignments
5. Conduct quarterly access reviews to verify role separation is maintained`,

    "IAM-005-SCR": `## Why This Matters
Session Lock Timeout automatically locks the screen after a period of inactivity, preventing unauthorized access to unlocked workstations.

## Risks if Left Unresolved
- Unlocked workstations accessible to anyone passing by
- Shoulder surfing and opportunistic access to sensitive data
- Non-compliant with CIS 18.9.50.1, NIST PR.AC-11

## Step-by-Step Remediation
1. Open **Settings** → **Personalization** → **Lock screen** → **Screen timeout settings**
2. Set screen timeout to 15 minutes or less
3. Group Policy: \`gpedit.msc\` → Computer Configuration → Windows Settings → Security Settings → Local Policies → Security Options → **Interactive logon: Machine inactivity limit** → set to 900 seconds (15 minutes) or less
4. Enable **Require sign-in after sleep** in Settings → Accounts → Sign-in options
5. Verify the lock screen activates after the configured timeout`,

    "IAM-006-GCD": `## Why This Matters
The Guest account provides unauthenticated access to the system. Even disabled by default, re-enabling it creates an unpermissioned entry point.

## Risks if Left Unresolved
- Anonymous access to shared resources
- Privilege escalation from guest to higher-privilege accounts
- Non-compliant with CIS 5.1, NIST PR.AA-01

## Step-by-Step Remediation
1. Verify status: \`Get-LocalUser -Name Guest | Select Enabled\`
2. Disable: \`Disable-LocalUser -Name Guest\`
3. Group Policy: \`secpol.msc\` → Local Policies → Security Options → **Accounts: Guest account status** → **Disabled**
4. Also deny network access to Guest: \`secpol.msc\` → Local Policies → User Rights Assignment → **Deny access to this computer from the network** → add **Guest**
5. Verify: \`Get-LocalUser -Name Guest | Select Enabled\` should be **False**`,

    "IAM-007-LAD": `## Why This Matters
The built-in Administrator account (RID 500) has a well-known SID and is targeted first in brute-force attacks. Disabling it forces use of named admin accounts with proper auditing.

## Risks if Left Unresolved
- Account is the first brute-force target due to its well-known SID
- Actions cannot be attributed to specific individuals (shared account)
- Non-compliant with CIS 5.1, NIST PR.AA-01

## Step-by-Step Remediation
1. Create a new named admin account before disabling the built-in one
2. Disable: \`Disable-LocalUser -Name Administrator\`
3. If using LAPS, the local admin can be managed with unique passwords per device
4. Rename the account as an additional measure: \`Rename-LocalUser -Name Administrator -NewName "xyz_admin"\`
5. Verify: \`Get-LocalUser -Name Administrator -ErrorAction SilentlyContinue | Select Enabled\` or check renamed account`,

    "IAM-008-ALP": `## Why This Matters
Account Lockout Policy locks accounts after repeated failed login attempts, preventing brute-force and password-spraying attacks.

## Risks if Left Unresolved
- Unlimited login attempts enable brute-force password cracking
- Automated credential-spraying tools can test thousands of passwords
- Non-compliant with CIS 5.3.1, NIST PR.AA-01

## Step-by-Step Remediation
1. Open \`secpol.msc\` → Account Policies → Account Lockout Policy
2. Set **Account lockout threshold** to **5** invalid logon attempts
3. Set **Account lockout duration** to **30** minutes
4. Set **Reset account lockout counter after** to **30** minutes
5. Monitor Security Event Log (Event ID 4740) for lockout events to detect attack patterns`,

    "IAM-009-NTM": `## Why This Matters
NTLM authentication (v1 especially) is vulnerable to relay and cracking attacks. Enforcing NTLMv2 only rejects weaker NTLM and LM authentication protocols.

## Risks if Left Unresolved
- NTLMv1 and LM hashes easily cracked with modern hardware
- NTLM relay attacks enable lateral movement
- Non-compliant with CIS 2.3.11.7, NIST PR.AA-01

## Step-by-Step Remediation
1. Group Policy: \`secpol.msc\` → Local Policies → Security Options → **Network security: LAN Manager authentication level**
2. Set to **Send NTLMv2 response only. Refuse LM & NTLM**
3. Registry: \`Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Lsa' -Name 'LmCompatibilityLevel' -Value 5 -Type DWord\`
4. Test legacy application compatibility — some older apps may require NTLMv1
5. Verify: \`(Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Lsa').LmCompatibilityLevel\` should be **5**`,

    "IAM-010-ANO": `## Why This Matters
Anonymous SAM enumeration allows unauthenticated users to list domain accounts and groups. Attackers use this for reconnaissance before launching credential attacks.

## Risks if Left Unresolved
- Account enumeration reveals valid usernames for targeted attacks
- Group membership disclosure reveals organizational structure
- Non-compliant with CIS 2.3.10.2, NIST PR.AA-01

## Step-by-Step Remediation
1. Group Policy: \`secpol.msc\` → Local Policies → Security Options
2. Set **Network access: Do not allow anonymous enumeration of SAM accounts** to **Enabled**
3. Set **Network access: Do not allow anonymous enumeration of SAM accounts and shares** to **Enabled**
4. Registry: \`Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Lsa' -Name 'RestrictAnonymousSAM' -Value 1\`
5. Verify: \`(Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Lsa').RestrictAnonymousSAM\` should be **1**`,

    // ── Data Security ───────────────────────────────────────────────────────

    "DAT-001-ENC": `## Why This Matters
Data encryption at rest protects stored information from unauthorized access, even if physical security is breached. This is a foundational requirement for regulatory compliance.

## Risks if Left Unresolved
- Stolen or decommissioned drives expose sensitive data
- Regulatory penalties under GDPR, HIPAA, PCI-DSS
- Non-compliant with CIS 3.11, NIST PR.DS-01, ISO 27001 A.8.24

## Step-by-Step Remediation
1. Enable BitLocker for Windows (see OS-002-BLK) or FileVault for macOS
2. Ensure encryption covers all data volumes, not just the OS drive
3. Use XTS-AES 256-bit encryption for maximum protection
4. Store recovery keys securely (Azure AD, on-premises AD, or hardware security module)
5. Verify all volumes are encrypted: \`Get-BitLockerVolume | Select MountPoint, ProtectionStatus\``,

    "DAT-002-DLP": `## Why This Matters
Data Loss Prevention controls prevent sensitive data (PII, financial records, credentials) from being exfiltrated via email, USB, or cloud storage.

## Risks if Left Unresolved
- Accidental or intentional data leakage of sensitive information
- Regulatory violations from uncontrolled data transfer
- Non-compliant with NIST PR.DS-02, ISO 27001 A.8.12

## Step-by-Step Remediation
1. Identify and classify sensitive data types (PII, financial, healthcare records)
2. Deploy Microsoft Purview DLP or equivalent solution
3. Create DLP policies for email, endpoints, and cloud apps
4. Start with monitoring mode, then enforce after tuning false positives
5. Review DLP alerts weekly and refine policies based on findings`,

    "DAT-003-BKP": `## Why This Matters
Regular data backups ensure business continuity after ransomware attacks, hardware failures, or accidental deletions. Without tested backups, data loss is permanent.

## Risks if Left Unresolved
- Ransomware destroys data with no recovery option
- Hardware failure results in permanent data loss
- Non-compliant with CIS 11.2, NIST PR.IP-04

## Step-by-Step Remediation
1. Implement the 3-2-1 rule: 3 copies, 2 different media, 1 offsite
2. Configure automated daily backups in **Settings** → **Update & Security** → **Backup**
3. Test backup restoration monthly — untested backups are worthless
4. For ransomware protection, keep at least one offline/air-gapped backup
5. Document the recovery procedure and train staff on the restoration process`,

    "DAT-004-TLS": `## Why This Matters
TLS 1.0 and 1.1 have known vulnerabilities (BEAST, POODLE, CRIME). Modern encryption requires TLS 1.2 or higher. Disabling legacy versions prevents downgrade attacks.

## Risks if Left Unresolved
- Downgrade attacks force connections to vulnerable protocol versions
- Man-in-the-middle attacks exploit TLS 1.0/1.1 weaknesses
- Non-compliant with PCI-DSS 3.2.1, NIST TR-52

## Step-by-Step Remediation
1. Disable TLS 1.0: \`New-Item -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\SecurityProviders\\SCHANNEL\\Protocols\\TLS 1.0\\Client' -Force; Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\SecurityProviders\\SCHANNEL\\Protocols\\TLS 1.0\\Client' -Name 'Enabled' -Value 0 -Type DWord\`
2. Disable TLS 1.1 similarly at the TLS 1.1 path
3. Verify TLS 1.2 is enabled (should be by default on Windows 10+)
4. Test applications for compatibility — some legacy apps may break
5. Restart the system for SChannel changes to take effect`,

    "DAT-005-RDP": `## Why This Matters
RDP Clipboard Sharing allows copy/paste between remote and local sessions. While convenient, it enables data exfiltration from remote sessions through clipboard redirection.

## Risks if Left Unresolved
- Sensitive data (passwords, documents) can be copied out via clipboard
- Malware can use clipboard redirection for data staging
- Non-compliant with CIS 18.9.65.3.3.1

## Step-by-Step Remediation
1. Group Policy: \`gpedit.msc\` → Computer Configuration → Administrative Templates → Windows Components → Remote Desktop Services → Remote Desktop Session Host → Device and Resource Redirection
2. Set **Do not allow Clipboard redirection** to **Enabled**
3. Registry: \`Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows NT\\Terminal Services' -Name 'fDisableClip' -Value 1\`
4. Also consider disabling drive redirection for additional data protection
5. Verify the setting is applied in the Group Policy editor`,

    // ── Logging & Monitoring ────────────────────────────────────────────────

    "LOG-001-AUD": `## Why This Matters
Audit Logging records security-relevant events (logon attempts, policy changes, file access) for forensic investigation and compliance. Without audit logs, breaches go undetected.

## Risks if Left Unresolved
- No audit trail for incident investigation
- Compliance audit failures (every major framework requires logging)
- Non-compliant with CIS 17.1-9, NIST DE.AE-02, ISO 27001 A.8.15

## Step-by-Step Remediation
1. Open \`secpol.msc\` → Local Policies → Audit Policy (or Advanced Audit Policy Configuration)
2. Enable **Audit logon events** (Success and Failure)
3. Enable **Audit object access**, **Audit policy change**, **Audit privilege use**
4. Configure event log sizes: Security log → at least 200MB
5. Forward events to a SIEM or centralized log collector for analysis`,

    "LOG-002-SIEM": `## Why This Matters
Security Information and Event Management (SIEM) aggregates, correlates, and alerts on security events from all endpoints. Without centralized monitoring, threats go undetected across the environment.

## Risks if Left Unresolved
- Security events siloed on individual machines
- No correlation of attack patterns across endpoints
- Non-compliant with CIS 8.2, NIST DE.AE-02

## Step-by-Step Remediation
1. Deploy a SIEM solution (Microsoft Sentinel, Splunk, Elastic SIEM, or open-source alternatives)
2. Configure Windows Event Forwarding (WEF) to collect Security and PowerShell logs
3. Create detection rules for: failed logins (4625), account lockouts (4740), privilege escalation (4672), service installations (7045)
4. Set up alerting thresholds and escalation procedures
5. Review SIEM dashboards daily for anomalous activity patterns`,

    "LOG-003-AUL": `## Why This Matters
Auditing logon events records every successful and failed login attempt, providing essential data for detecting brute-force attacks, unauthorized access, and compromised accounts.

## Risks if Left Unresolved
- Failed brute-force attacks go unnoticed
- No record of unauthorized logons for investigation
- Non-compliant with CIS 17.5.1, NIST DE.AE-02

## Step-by-Step Remediation
1. Open \`secpol.msc\` → Advanced Audit Policy Configuration → Logon/Logoff
2. Set **Audit Logon** to **Success and Failure**
3. Set **Audit Logoff** to **Success**
4. Set **Audit Account Lockout** to **Failure**
5. Verify events appear in Event Viewer → Security Log (Event IDs 4624, 4625, 4634)`,

    "LOG-004-EVL": `## Why This Matters
Default Windows event log sizes are too small. Critical security events get overwritten before they can be reviewed or forwarded, creating gaps in forensic evidence.

## Risks if Left Unresolved
- Security events overwritten within hours on busy systems
- Forensic evidence lost before incident investigation begins
- Non-compliant with CIS 18.9.27.1

## Step-by-Step Remediation
1. Open Event Viewer → right-click **Security** log → **Properties**
2. Set **Maximum log size** to at least **200 MB** (204800 KB)
3. Set retention to **Overwrite events as needed** (or archive when full for critical systems)
4. Apply similar sizing to Application and System logs
5. PowerShell: \`wevtutil sl Security /ms:209715200\` (200 MB in bytes)`,

    "LOG-005-ACM": `## Why This Matters
Auditing account management events records user/group creation, deletion, and modification. This is critical for detecting unauthorized account manipulation.

## Risks if Left Unresolved
- Attacker-created backdoor accounts go undetected
- Group membership changes granting excessive privileges are invisible
- Non-compliant with CIS 17.2.1, NIST DE.AE-02

## Step-by-Step Remediation
1. Open \`secpol.msc\` → Advanced Audit Policy Configuration → Account Management
2. Set **Audit User Account Management** to **Success and Failure**
3. Set **Audit Security Group Management** to **Success and Failure**
4. Monitor Event IDs: 4720 (user created), 4726 (user deleted), 4732 (member added to group)
5. Forward these events to your SIEM for alerting on unauthorized changes`,

    "LOG-006-PRV": `## Why This Matters
Audit Privilege Use tracks when sensitive privileges are exercised (debug programs, take ownership, act as part of the OS). This detects privilege escalation and misuse.

## Risks if Left Unresolved
- Privilege escalation attacks undetected
- Misuse of sensitive system privileges (e.g., SeDebugPrivilege for credential dumping)
- Non-compliant with CIS 17.8.1, NIST DE.AE-02

## Step-by-Step Remediation
1. Open \`secpol.msc\` → Advanced Audit Policy Configuration → Privilege Use
2. Set **Audit Sensitive Privilege Use** to **Success and Failure**
3. Key privileges to monitor: SeDebugPrivilege, SeTakeOwnershipPrivilege, SeImpersonatePrivilege
4. Monitor Event ID 4673 (special privilege assigned) and 4674 (operation attempted on a privileged object)
5. Alert on SeDebugPrivilege usage — legitimate use is rare, malicious use is common`,

    // ── Policy & Governance ─────────────────────────────────────────────────

    "POL-001-SEC": `## Why This Matters
A documented Security Policy establishes the organization's commitment to information security and sets expectations for all users. It is the foundation of any security programme.

## Risks if Left Unresolved
- No formal authority to enforce security controls
- Employees unaware of security responsibilities
- Compliance failures in every major framework (ISO 27001, SOC 2, etc.)

## Step-by-Step Remediation
1. Draft a security policy covering: acceptable use, access control, incident response, data classification
2. Include roles and responsibilities, enforcement mechanisms, and review schedule
3. Get executive sign-off to establish organizational authority
4. Distribute to all staff and require acknowledgement
5. Review and update annually or after major security incidents`,

    "POL-002-IRP": `## Why This Matters
An Incident Response Plan provides structured procedures for detecting, containing, and recovering from security incidents. Without it, response is chaotic and damage is amplified.

## Risks if Left Unresolved
- Delayed and disorganized response extends breach impact
- Critical evidence destroyed during uncoordinated response
- Non-compliant with CIS 17, NIST RS.RP-01, ISO 27001 A.5.24

## Step-by-Step Remediation
1. Define incident categories and severity levels
2. Establish response team roles: Incident Commander, Communications, Technical Response, Legal
3. Document procedures for each phase: Detection → Containment → Eradication → Recovery → Lessons Learned
4. Include contact lists, escalation paths, and communication templates
5. Conduct tabletop exercises quarterly to test and refine the plan`,

    "POL-003-VMP": `## Why This Matters
A Vulnerability Management Program systematically identifies, prioritizes, and remediates security vulnerabilities across the environment. Ad-hoc patching leaves gaps.

## Risks if Left Unresolved
- Known vulnerabilities remain unpatched and exploitable
- No systematic prioritization — critical vulnerabilities treated same as low
- Non-compliant with CIS 7.1, NIST ID.RA-01

## Step-by-Step Remediation
1. Deploy vulnerability scanning (MagenSec, Nessus, Qualys, or OpenVAS)
2. Establish scanning frequency: critical systems weekly, others monthly
3. Define SLAs: Critical = 48 hours, High = 7 days, Medium = 30 days, Low = 90 days
4. Track remediation progress with a dashboard and regular reporting
5. Conduct exception reviews for vulnerabilities that cannot be patched (compensating controls)`,

    "POL-004-BCP": `## Why This Matters
A Business Continuity Plan ensures critical operations can continue during and after disruptions (cyberattacks, natural disasters, infrastructure failures).

## Risks if Left Unresolved
- Extended downtime during incidents with no recovery plan
- Loss of revenue, customer trust, and regulatory standing
- Non-compliant with ISO 27001 A.5.29-30

## Step-by-Step Remediation
1. Identify critical business functions and their maximum tolerable downtime (RTO)
2. Document recovery procedures for each critical system
3. Identify dependencies (cloud services, key personnel, third-party vendors)
4. Establish communication plans for stakeholders during disruptions
5. Test the BCP annually with simulated scenarios and update based on findings`,

    "POL-005-VNR": `## Why This Matters
Third-party vendors and suppliers often have access to your systems and data. Without risk assessment, a vendor breach becomes your breach.

## Risks if Left Unresolved
- Vendor compromises cascade to your environment (SolarWinds, Kaseya)
- Unassessed vendor access may violate data protection regulations
- Non-compliant with NIST ID.SC-02, ISO 27001 A.5.19-22

## Step-by-Step Remediation
1. Inventory all third-party vendors with access to systems or data
2. Classify vendors by risk level (data access, system access, criticality)
3. Require security questionnaires or SOC 2 reports from high-risk vendors
4. Include security requirements and breach notification clauses in contracts
5. Review vendor access quarterly and revoke when no longer needed`,

    "POL-006-CHG": `## Why This Matters
Change Management ensures that modifications to systems, configurations, and code are reviewed, approved, and documented. It prevents outages from untested changes and unauthorized modifications.

## Risks if Left Unresolved
- Untested changes cause production outages
- Unauthorized modifications introduce security vulnerabilities
- Non-compliant with CIS 4.1, ISO 27001 A.8.32

## Step-by-Step Remediation
1. Define change categories: Standard (pre-approved), Normal (review required), Emergency (expedited)
2. Require change requests with: description, risk assessment, rollback plan, testing evidence
3. Establish a Change Advisory Board (CAB) for Normal and Emergency changes
4. Maintain a change log with all approved and implemented changes
5. Review change failures monthly and update procedures to prevent recurrence`,

    // ── Asset Management ────────────────────────────────────────────────────

    "AST-001-INV": `## Why This Matters
You cannot protect what you don't know exists. A maintained asset inventory is the foundation of all security controls — every other control depends on knowing what assets you have.

## Risks if Left Unresolved
- Unknown devices and software evade security controls
- Shadow IT creates unmonitored attack surface
- Non-compliant with CIS 1.1, NIST ID.AM-01

## Step-by-Step Remediation
1. Deploy MagenSec or similar agent to automatically discover and inventory endpoints
2. Categorize assets: workstations, servers, mobile devices, network equipment, IoT
3. Record key attributes: OS, location, owner, criticality, last patched date
4. Set up alerts for unauthorized devices on the network
5. Review and update the inventory quarterly — remove decommissioned assets`,

    "AST-002-UAT": `## Why This Matters
Users are both the strongest and weakest link in security. Security awareness training turns employees from attack vectors into active defenders who recognise phishing, social engineering, and suspicious behaviour.

## Risks if Left Unresolved
- Untrained users fall victim to phishing (90%+ of breaches start with phishing)
- Social engineering attacks bypass technical controls
- Non-compliant with CIS 14.1, NIST PR.AT-01

## Step-by-Step Remediation
1. Deploy a security awareness platform (KnowBe4, Proofpoint, or similar)
2. Cover key topics: phishing recognition, password hygiene, social engineering, physical security
3. Conduct simulated phishing campaigns monthly
4. Require annual certification with pass/fail assessment
5. Track metrics: click rates, report rates, quiz scores — and use them to target additional training`,

    // ── Software Security ───────────────────────────────────────────────────

    "SW-001-PUA": `## Why This Matters
Potentially Unwanted Application (PUA) protection detects and blocks adware, bundleware, and low-reputation software that may degrade system security or performance.

## Risks if Left Unresolved
- Adware and bundleware install toolbars, cryptocurrency miners, or spyware
- PUAs may bundle legitimate software with data-harvesting components
- Non-compliant with CIS 10.1

## Step-by-Step Remediation
1. Open **Windows Security** → **App & browser control** → **Reputation-based protection settings**
2. Toggle **Potentially unwanted app blocking** to **On** (both block downloads and block apps)
3. PowerShell: \`Set-MpPreference -PUAProtection Enabled\`
4. Verify: \`Get-MpPreference | Select PUAProtection\` — should return **1** (Enabled)
5. Review quarantined PUAs in Windows Security → Protection History`,

    "SW-002-USB": `## Why This Matters
USB mass storage devices are a primary vector for data exfiltration and malware delivery. Restricting USB access prevents both insider threats and USB-based attacks (BadUSB).

## Risks if Left Unresolved
- Removable media can introduce malware bypassing network security
- Data exfiltration via USB drives is untraceable without DLP
- Non-compliant with CIS 8.4

## Step-by-Step Remediation
1. Group Policy: \`gpedit.msc\` → Computer Configuration → Administrative Templates → System → Removable Storage Access
2. Set **Removable Disks: Deny write access** to **Enabled**
3. Set **Removable Disks: Deny read access** to **Enabled** (for maximum restriction)
4. For selective access, use Windows Defender Device Control policies to whitelist specific devices by hardware ID
5. Verify by inserting a USB drive — it should not appear as accessible storage`,

    "SW-003-MCR": `## Why This Matters
Office macros are the most common delivery mechanism for malware (Emotet, TrickBot, Dridex). Restricting macros dramatically reduces the attack surface from email-based threats.

## Risks if Left Unresolved
- Macro-enabled documents deliver malware through email attachments
- Users are tricked into enabling macros via social engineering
- Non-compliant with CIS 10.3, NIST PR.PS-01

## Step-by-Step Remediation
1. Group Policy: \`gpedit.msc\` → User Configuration → Administrative Templates → Microsoft Office → Security Settings
2. Set **VBA Macro Notification Settings** to **Disable all except digitally signed macros**
3. Or use Attack Surface Reduction (ASR) rule: Block Office applications from creating executable content
4. For Excel/Word individually: File → Options → Trust Center → Macro Settings → **Disable all macros with notification**
5. Only sign and allow macros from verified, trusted internal developers`,

    "SW-004-ASR": `## Why This Matters
Attack Surface Reduction (ASR) rules are built-in Windows Defender settings that block common malware behaviours: Office macro code injection, credential theft, ransomware, and email-based exploits.

## Risks if Left Unresolved
- Common malware techniques succeed without behavioral blocking
- Office-based exploits execute child processes and scripts freely
- Non-compliant with CIS 10.5, NIST PR.PS-01

## Step-by-Step Remediation
1. Enable key ASR rules via PowerShell:
   \`\`\`
   $rules = @(
     "BE9BA2D9-53EA-4CDC-84E5-9B1EEEE46550",  # Block executable content from email
     "D4F940AB-401B-4EFC-AADC-AD5F3C50688A",  # Block Office child processes
     "3B576869-A4EC-4529-8536-B80A7769E899",  # Block Office from creating executable content
     "75668C1F-73B5-4CF0-BB93-3ECF5CB7CC84"   # Block Office from injecting into other processes
   )
   $rules | ForEach { Set-MpPreference -AttackSurfaceReductionRules_Ids $_ -AttackSurfaceReductionRules_Actions Enabled }
   \`\`\`
2. Start with **Audit mode** before enforcing: use **AuditMode** instead of **Enabled**
3. Monitor ASR events in Event Viewer (Event ID 1121, 1122)
4. Review blocked events for false positives before switching to Block mode
5. Verify: \`Get-MpPreference | Select -ExpandProperty AttackSurfaceReductionRules_Actions\``,

    "SW-005-SAU": `## Why This Matters
Microsoft Store Auto-Update keeps Store-delivered apps current with the latest security patches and bug fixes. Disabling it leaves UWP apps unpatched.

## Risks if Left Unresolved
- Store apps remain vulnerable to known security issues
- Inconsistent app versions across devices complicating support
- Non-compliant with CIS 3.4

## Step-by-Step Remediation
1. Open **Microsoft Store** → click profile icon → **App settings**
2. Toggle **App updates** to **On**
3. Group Policy: \`gpedit.msc\` → Computer Configuration → Administrative Templates → Windows Components → Store → set **Turn off Automatic Download** to **Disabled** (this re-enables auto-update)
4. For managed environments, use WSUS or Intune to control Store app updates
5. Verify by checking for updates manually: Microsoft Store → Library → **Get updates**`,

    "SW-006-INS": `## Why This Matters
Windows Installer auto-elevation allows MSI packages to install with elevated privileges without prompting. This enables malware to silently install with SYSTEM-level access.

## Risks if Left Unresolved
- Malicious MSI packages install with elevated privileges silently
- Privilege escalation from user to SYSTEM via crafted installers
- Non-compliant with CIS 18.9.51.1

## Step-by-Step Remediation
1. Group Policy: \`secpol.msc\` → Local Policies → Security Options
2. Set **Windows Installer: Always install with elevated privileges** to **Disabled**
3. Registry: \`Set-ItemProperty -Path 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Installer' -Name 'AlwaysInstallElevated' -Value 0\`
4. Also check user-level: \`Set-ItemProperty -Path 'HKCU:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Installer' -Name 'AlwaysInstallElevated' -Value 0\`
5. Verify both registry values are **0**`,

    // ── Supply Chain ────────────────────────────────────────────────────────

    "SC-001-TPR": `## Why This Matters
Third-party access control governs how vendors, contractors, and partners access your systems. Uncontrolled access creates persistent backdoors into your environment.

## Risks if Left Unresolved
- Vendor accounts persist after engagement ends
- Excessive vendor privileges enable lateral movement
- Non-compliant with NIST PR.AA-05, ISO 27001 A.5.19

## Step-by-Step Remediation
1. Maintain a register of all third parties with system access
2. Apply least-privilege: grant only the minimum access needed for each vendor's role
3. Require MFA for all third-party accounts without exception
4. Set access expiration dates aligned with contract terms
5. Review and revoke third-party access quarterly and immediately upon contract termination`,

    "SC-002-SWS": `## Why This Matters
Software supply chain attacks inject malicious code into trusted software updates and packages (e.g., SolarWinds Orion, Codecov). Verifying software integrity prevents these attacks.

## Risks if Left Unresolved
- Compromised updates install backdoors across the entire organization
- Dependency confusion attacks introduce malicious packages
- Non-compliant with NIST SR-04, ISO 27001 A.8.31

## Step-by-Step Remediation
1. Verify software signatures before installation — check digital signatures and checksums
2. Use package managers with signature verification enabled (NuGet, npm audit, pip-audit)
3. Implement an allowlist of approved software sources
4. Monitor for unexpected software changes with file integrity monitoring (FIM)
5. Subscribe to vendor security advisories for critical software components`,

    // ── macOS Controls ──────────────────────────────────────────────────────

    "MAC-001-FVT": `## Why This Matters
FileVault provides full-disk encryption for macOS, protecting all data at rest. Without it, anyone with physical access to the Mac can read the drive.

## Risks if Left Unresolved
- Data exposure from lost/stolen MacBooks
- Direct disk access bypasses all OS-level access controls
- Non-compliant with CIS macOS 2.6.1, NIST PR.DS-01

## Step-by-Step Remediation
1. Open **System Preferences** → **Security & Privacy** → **FileVault** tab
2. Click the lock icon, authenticate, and click **Turn On FileVault**
3. Choose recovery key method: iCloud account or create a local recovery key
4. Store the recovery key securely (never on the same device)
5. Verify: \`fdesetup status\` should show **FileVault is On**`,

    "MAC-002-GKP": `## Why This Matters
Gatekeeper verifies that applications are signed by identified developers or distributed through the App Store. It prevents execution of unsigned and potentially malicious software.

## Risks if Left Unresolved
- Unsigned malware executes without any verification or warning
- Users can download and run trojanized applications
- Non-compliant with CIS macOS 2.5.2.1

## Step-by-Step Remediation
1. Open **System Preferences** → **Security & Privacy** → **General** tab
2. Under **Allow apps downloaded from**, select **App Store and identified developers**
3. Terminal: \`sudo spctl --master-enable\`
4. Verify: \`spctl --status\` should show **assessments enabled**
5. Do not disable Gatekeeper with \`--master-disable\` even temporarily`,

    "MAC-003-SIP": `## Why This Matters
System Integrity Protection (SIP) prevents modification of protected system files and processes, even by the root user. It is macOS's primary defence against rootkits and kernel-level tampering.

## Risks if Left Unresolved
- Rootkits can modify system binaries and persist across reboots
- Attackers with root access can tamper with security tools
- Non-compliant with CIS macOS 5.1.2

## Step-by-Step Remediation
1. Check status: Terminal → \`csrutil status\`
2. If disabled, reboot into Recovery Mode (hold Cmd+R during startup)
3. Open Terminal from the Utilities menu in Recovery Mode
4. Run: \`csrutil enable\`
5. Reboot normally; verify with \`csrutil status\` — should show **System Integrity Protection status: enabled**`,

    "MAC-004-FWL": `## Why This Matters
The macOS Application Firewall controls incoming network connections to applications. It blocks unauthorized inbound traffic while allowing legitimate applications to function.

## Risks if Left Unresolved
- Unauthorised inbound connections to vulnerable services
- No filtering of incoming network traffic to applications
- Non-compliant with CIS macOS 2.2.1

## Step-by-Step Remediation
1. Open **System Preferences** → **Security & Privacy** → **Firewall** tab
2. Click the lock icon, authenticate, then click **Turn On Firewall**
3. Click **Firewall Options** → enable **Block all incoming connections** for maximum security, or allow specific signed applications
4. Enable **Stealth Mode** (prevents the Mac from responding to probing requests like ping)
5. Terminal: \`sudo /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate on\` then \`--setstealthmode on\``,

    "MAC-005-AUP": `## Why This Matters
macOS Automatic Updates ensure the system receives critical security patches from Apple. Delayed patching leaves the system vulnerable to known exploits.

## Risks if Left Unresolved
- Known macOS vulnerabilities remain unpatched
- Zero-day exploits weaponized before manual patches applied
- Non-compliant with CIS macOS 1.2

## Step-by-Step Remediation
1. Open **System Preferences** → **Software Update**
2. Check **Automatically keep my Mac up to date**
3. Click **Advanced** and enable all options: check for updates, download, install macOS updates, install app updates, install system data files
4. Terminal: \`sudo defaults write /Library/Preferences/com.apple.SoftwareUpdate AutomaticCheckEnabled -bool true\`
5. Verify: \`defaults read /Library/Preferences/com.apple.SoftwareUpdate AutomaticCheckEnabled\` should return **1**`,

    "MAC-006-RLG": `## Why This Matters
Remote Login enables SSH access to the Mac. If not needed, it should be disabled to reduce attack surface and prevent brute-force SSH attacks.

## Risks if Left Unresolved
- SSH service exposed to brute-force credential attacks
- Remote command execution if credentials are compromised
- Non-compliant with CIS macOS 2.4.6

## Step-by-Step Remediation
1. Open **System Preferences** → **Sharing** → uncheck **Remote Login**
2. Terminal: \`sudo systemsetup -setremotelogin off\`
3. If SSH is required, restrict to specific users: **System Preferences** → **Sharing** → **Remote Login** → **Allow access for: Only these users**
4. Use SSH keys instead of passwords: disable password authentication in \`/etc/ssh/sshd_config\`
5. Verify: \`sudo systemsetup -getremotelogin\` should show **Remote Login: Off**`,

    "MAC-007-RMG": `## Why This Matters
Apple Remote Desktop (ARD) allows full remote control of the Mac. If not actively used for IT management, it should be disabled to prevent unauthorized remote access.

## Risks if Left Unresolved
- Full remote control of the Mac by anyone on the network
- ARD has had multiple privilege escalation vulnerabilities
- Non-compliant with CIS macOS 2.4.10

## Step-by-Step Remediation
1. Open **System Preferences** → **Sharing** → uncheck **Remote Management**
2. Terminal: \`sudo /System/Library/CoreServices/RemoteManagement/ARDAgent.app/Contents/Resources/kickstart -deactivate -configure -access -off\`
3. If ARD is needed, restrict to specific admin users only
4. Ensure ARD is not exposed to external networks (firewall rules)
5. Verify: check **System Preferences** → **Sharing** — Remote Management should be unchecked`,

    // ── Linux Controls ──────────────────────────────────────────────────────

    "LNX-001-FWL": `## Why This Matters
A host-based firewall (UFW, iptables, firewalld) is the Linux equivalent of Windows Firewall. It controls network access at the endpoint and blocks unauthorized connections.

## Risks if Left Unresolved
- All ports and services exposed to the network
- No protection against unauthorized inbound connections
- Non-compliant with CIS Linux 3.5.1.1

## Step-by-Step Remediation
1. Check current status: \`sudo ufw status\` or \`sudo systemctl status firewalld\`
2. Enable UFW: \`sudo ufw enable\`
3. Set default policy: \`sudo ufw default deny incoming; sudo ufw default allow outgoing\`
4. Allow only required services: \`sudo ufw allow ssh\` (if needed), \`sudo ufw allow 443/tcp\`
5. Verify rules: \`sudo ufw status verbose\``,

    "LNX-002-SSH": `## Why This Matters
SSH root login allows direct access to the most privileged account. Disabling it forces use of regular user accounts and \`sudo\`, providing an audit trail and limiting blast radius.

## Risks if Left Unresolved
- Direct brute-force attacks on the root account via SSH
- No audit trail — multiple admins sharing root credentials
- Non-compliant with CIS Linux 5.3.4, NIST PR.AA-05

## Step-by-Step Remediation
1. Edit SSH config: \`sudo nano /etc/ssh/sshd_config\`
2. Set \`PermitRootLogin no\`
3. Restart SSH: \`sudo systemctl restart sshd\`
4. Ensure a regular user account with \`sudo\` access exists before disabling root login
5. Verify: \`sudo sshd -T | grep permitrootlogin\` should show **no**`,

    "LNX-003-AAM": `## Why This Matters
Mandatory Access Control (AppArmor or SELinux) confines applications to a limited set of resources, preventing compromised processes from accessing unauthorized files or network resources.

## Risks if Left Unresolved
- Compromised processes have unrestricted access to the filesystem
- No containment of exploited services
- Non-compliant with CIS Linux 1.7.1.1

## Step-by-Step Remediation
1. Check status: \`sudo apparmor_status\` or \`sestatus\`
2. For AppArmor: \`sudo systemctl enable apparmor; sudo systemctl start apparmor\`
3. For SELinux: edit \`/etc/selinux/config\` and set \`SELINUX=enforcing\`
4. After enabling, reboot the system
5. Verify: \`sudo apparmor_status\` should show profiles loaded, or \`sestatus\` should show **enforcing**`,

    "LNX-004-AUP": `## Why This Matters
Automatic security updates ensure critical patches are applied promptly on Linux systems. Without them, known vulnerabilities remain exploitable.

## Risks if Left Unresolved
- Security patches not applied until manual intervention
- Known vulnerabilities remain exploitable for extended periods
- Non-compliant with CIS Linux 1.9

## Step-by-Step Remediation
1. **Ubuntu/Debian**: \`sudo apt install unattended-upgrades; sudo dpkg-reconfigure -plow unattended-upgrades\`
2. **RHEL/CentOS**: \`sudo yum install yum-cron; sudo systemctl enable yum-cron; sudo systemctl start yum-cron\`
3. Configure to apply security updates only (not all updates) for stability
4. Review update logs: \`/var/log/unattended-upgrades/\` or \`/var/log/yum.log\`
5. Verify: \`cat /etc/apt/apt.conf.d/20auto-upgrades\` should show update intervals`,

    "LNX-005-ENC": `## Why This Matters
LUKS (Linux Unified Key Setup) provides full-disk encryption for Linux systems, protecting data at rest from physical access attacks.

## Risks if Left Unresolved
- Data exposure from lost/stolen devices with unencrypted drives
- Regulatory non-compliance (GDPR, HIPAA, PCI-DSS)
- Non-compliant with CIS Linux 1.1.1.7, NIST PR.DS-01

## Step-by-Step Remediation
1. **New installations**: Select encryption during OS installation (recommended approach)
2. For existing systems, encrypt during a planned migration (backup data first)
3. Verify encryption: \`sudo cryptsetup luksDump /dev/sda2\` (replace with your partition)
4. Ensure a strong passphrase is set (20+ characters)
5. Store recovery keys securely — without them, encrypted data is permanently inaccessible`,

    "LNX-006-COR": `## Why This Matters
Core dumps may contain sensitive information from application memory: passwords, encryption keys, session tokens. Disabling them prevents data leakage through crash dumps.

## Risks if Left Unresolved
- Passwords and credentials in core dumps accessible to local users
- Encryption keys and session tokens exposed in crash files
- Non-compliant with CIS Linux 1.5.1

## Step-by-Step Remediation
1. Check current limit: \`ulimit -c\` — should show **0**
2. Persistent disable: add \`* hard core 0\` to \`/etc/security/limits.conf\`
3. Kernel parameter: add \`fs.suid_dumpable = 0\` to \`/etc/sysctl.conf\`
4. Apply: \`sudo sysctl -p\`
5. Disable systemd core dumps: set \`Storage=none\` in \`/etc/systemd/coredump.conf\` then \`sudo systemctl daemon-reload\``
};

function normalizeControlId(alert) {
    return String(alert?.controlId || '').trim().toUpperCase();
}

function buildSyncTemplate(alert) {
    const deviceName = alert?.deviceName || alert?.deviceId || 'this device';
    return `## Why This Matters
This alert means the device and cloud service no longer agree on the latest configuration, inventory, or compliance state for ${deviceName}. When telemetry stops syncing cleanly, the portal may show stale posture or miss recent changes.

## Risks if Left Unresolved
- Security posture may be evaluated using stale or partial data
- Recent software, compliance, or device-state changes may not appear in the portal
- Troubleshooting becomes slower because the device and cloud view diverge

## Step-by-Step Remediation
1. Update the MagenSec client on the device to the latest approved version
2. Confirm the device is powered on, connected to the internet, and able to reach MagenSec services
3. Ask the user to open the client and wait for the next telemetry sync cycle to complete
4. Verify the device time and date are correct, because clock drift can break sync behavior
5. Recheck the alert after the device has been online long enough to upload fresh telemetry

## Quick Verification Checklist
- Client updated successfully
- Device is online and has working internet connectivity
- Telemetry has synced recently
- Alert clears after fresh device data reaches the portal`;
}

function buildVersionTemplate(alert) {
    const currentVersion = alert?.actual || 'the installed version';
    const expectedVersion = alert?.expected || 'the required minimum version';
    return `## Why This Matters
This alert means the device is running an older MagenSec client version (${currentVersion}) than the supported baseline (${expectedVersion}). Older client versions can miss reliability fixes, sync improvements, and security updates.

## Risks if Left Unresolved
- Device telemetry and compliance checks may become incomplete or unreliable
- Known bugs already fixed in newer releases may continue affecting the device
- Future platform features may not work correctly on the outdated client

## Step-by-Step Remediation
1. Update the MagenSec client to the latest approved release
2. If the in-app update does not work, reinstall using the approved installer path for your organization
3. Restart the device if the installer requests it or if background services do not reconnect automatically
4. Confirm the device reconnects and sends fresh telemetry after the update
5. Review the alert again to confirm the reported client version is now current

## Quick Verification Checklist
- Latest client installed
- Device restarted if required
- Client service is running normally
- Fresh telemetry received by the portal
- Version alert clears`;
}

function buildVulnerabilityTemplate(alert) {
    const cveId = normalizeControlId(alert).replace(/^VULN-/i, '') || 'the reported vulnerability';
    return `## Why This Matters
This alert indicates that ${cveId} affects software installed on the device. Vulnerable applications increase the chance of malware execution, privilege escalation, or unauthorized access.

## Risks if Left Unresolved
- Attackers may exploit the vulnerable software before patching is completed
- The affected device may become a pivot point for broader compromise
- Regulatory or customer obligations may require timely remediation

## Step-by-Step Remediation
1. Identify the affected application and installed version on the device
2. Update the application to the latest secure vendor-supported release
3. If no patch is available, reduce exposure by disabling the feature, restricting access, or uninstalling the software temporarily
4. Restart the application or device if required to complete the patch
5. Re-run inventory and vulnerability checks after the update window completes

## Quick Verification Checklist
- Affected application identified
- Secure version installed or exposure reduced
- Restart completed if needed
- Follow-up scan performed
- Vulnerability alert clears`;
}

function buildHealthTemplate(alert) {
    const currentState = alert?.actual || 'an unhealthy device state';
    return `## Why This Matters
This alert indicates the device is in a degraded health state (${currentState}). When a device is stale, offline, or ghosted, the portal cannot trust that its security data is current.

## Risks if Left Unresolved
- Threat, compliance, and inventory data may be outdated
- Security incidents on the device may go unreported
- Device coverage and operational reporting become inaccurate

## Step-by-Step Remediation
1. Confirm the device is powered on and connected to a stable network
2. Ask the user to open the MagenSec client and confirm it is running normally
3. Check whether local firewall, proxy, or VPN settings are blocking outbound connectivity
4. Update the client if it is out of date and restart the device if needed
5. Wait for fresh heartbeat and telemetry data, then review the alert again

## Quick Verification Checklist
- Device is online
- MagenSec client is running
- Network path to MagenSec is available
- Fresh heartbeat received
- Health alert clears`;
}

function buildUnstableTemplate(alert) {
    const title = alert?.controlName || alert?.controlId || 'this control';
    return `## Why This Matters
This alert indicates that ${title} is changing state too frequently. Repeated flipping between compliant and non-compliant usually means policy conflicts, endpoint instability, or competing tools modifying the same setting.

## Risks if Left Unresolved
- Controls may appear enabled while drifting back to an unsafe state
- Users and admins lose confidence in policy enforcement
- Repeated state churn can hide the real root cause during investigations

## Step-by-Step Remediation
1. Identify which policy, script, or management tool is expected to control the setting
2. Check for competing GPO, MDM, local script, or third-party security tool enforcement
3. Review recent device changes such as software installs, policy updates, or user modifications
4. Standardize the intended baseline and remove duplicate or conflicting enforcement paths
5. Monitor the device after remediation to ensure the setting remains stable

## Quick Verification Checklist
- Single source of control confirmed
- Conflicting tools or policies removed
- Setting remains stable across multiple check cycles
- Instability alert clears`;
}

function buildGenericComplianceTemplate(alert) {
    const title = alert?.controlName || alert?.controlId || 'this security control';
    return `## Why This Matters
${title} is not currently meeting the expected security baseline. Controls like this reduce attack surface, improve resilience, and support audit readiness.

## Risks if Left Unresolved
- The device may remain exposed to avoidable security weaknesses
- Security posture and audit scores may degrade over time
- Similar devices may have the same configuration gap if the baseline is not corrected centrally

## Step-by-Step Remediation
1. Compare the device's current setting with the expected baseline shown in the alert
2. Apply the required configuration change using the approved endpoint management method
3. If the setting is intentionally different, document the exception and compensating controls
4. Ensure the device remains online long enough to upload fresh telemetry
5. Recheck the alert after the next compliance sync cycle

## Quick Verification Checklist
- Expected setting identified
- Correct baseline applied
- Device synced successfully
- Alert status revalidated`;
}

function buildGenericDevicePolicyTemplate(alert) {
    const title = alert?.controlName || alert?.controlId || 'this device policy';
    return `## Why This Matters
${title} indicates the device is not aligned with the expected client or platform policy state. These alerts usually affect manageability, telemetry quality, or platform trust.

## Risks if Left Unresolved
- Device reporting may become unreliable or incomplete
- Support and troubleshooting may take longer because state is inconsistent
- Other platform protections may depend on this policy being healthy

## Step-by-Step Remediation
1. Confirm the device is online and communicating normally
2. Update the MagenSec client and any pending operating system updates
3. Review the device for policy enforcement failures or blocked services
4. Wait for a fresh heartbeat and telemetry upload
5. Recheck whether the device has returned to the expected platform state

## Quick Verification Checklist
- Device online
- Client current
- Policy enforcement healthy
- Fresh telemetry received
- Alert clears`;
}

export function getAlertRemediationTemplate(alert) {
    const controlId = normalizeControlId(alert);

    if (controlId && complianceRemediationCache[controlId]) {
        return complianceRemediationCache[controlId];
    }

    if (controlId === 'SYNC-CONFIG' || controlId.startsWith('SYNC-')) {
        return buildSyncTemplate(alert);
    }

    if (controlId === 'VERSION-CLIENT') {
        return buildVersionTemplate(alert);
    }

    if (controlId.startsWith('VULN-')) {
        return buildVulnerabilityTemplate(alert);
    }

    if (controlId.startsWith('UNSTABLE|')) {
        return buildUnstableTemplate(alert);
    }

    if (controlId.includes('OFFLINE') || controlId.includes('STALE') || controlId.includes('GHOST') || String(alert?.actual || '').toUpperCase().includes('OFFLINE')) {
        return buildHealthTemplate(alert);
    }

    const domain = String(alert?.domain || '').toUpperCase();
    if (domain === 'COMPLIANCE') {
        return buildGenericComplianceTemplate(alert);
    }

    if (domain === 'DEVICEPOLICY' || domain === 'DEVICESYNC' || domain === 'STABILITY') {
        return buildGenericDevicePolicyTemplate(alert);
    }

    return null;
}
