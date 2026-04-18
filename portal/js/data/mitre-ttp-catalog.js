/**
 * MITRE ATT&CK Technique Catalog
 *
 * Static mapping of T-codes → name, tactic, and display colour.
 * Source: MITRE ATT&CK Enterprise Matrix (public domain).
 * Only includes techniques commonly referenced in CVE / NVD data.
 *
 * Colours follow Tabler palette aligned to kill-chain stage:
 *   Reconnaissance / Resource Development → grey
 *   Initial Access                       → red
 *   Execution                            → orange-red
 *   Persistence / Privilege Escalation   → orange
 *   Defense Evasion / Credential Access  → amber
 *   Discovery / Lateral Movement         → yellow
 *   Collection / C2 / Exfiltration       → purple
 *   Impact                               → dark red
 */

// Tactic metadata (short form for badges)
export const TACTICS = {
    'reconnaissance':           { label: 'Recon',               colour: '#6c757d' },
    'resource-development':     { label: 'Resource Dev',        colour: '#6c757d' },
    'initial-access':           { label: 'Initial Access',      colour: '#d63939' },
    'execution':                { label: 'Execution',           colour: '#e8590c' },
    'persistence':              { label: 'Persistence',         colour: '#f76707' },
    'privilege-escalation':     { label: 'Priv Escalation',     colour: '#f76707' },
    'defense-evasion':          { label: 'Defense Evasion',     colour: '#f59f00' },
    'credential-access':        { label: 'Credential Access',   colour: '#f59f00' },
    'discovery':                { label: 'Discovery',           colour: '#fab005' },
    'lateral-movement':         { label: 'Lateral Movement',    colour: '#fab005' },
    'collection':               { label: 'Collection',          colour: '#7048e8' },
    'command-and-control':      { label: 'C2',                  colour: '#7048e8' },
    'exfiltration':             { label: 'Exfiltration',        colour: '#7048e8' },
    'impact':                   { label: 'Impact',              colour: '#ae3ec9' },
};

// Technique catalog — key = T-code (no sub-technique suffix for simplicity)
export const TECHNIQUES = {
    // Initial Access
    'T1189': { name: 'Drive-by Compromise',                     tactic: 'initial-access'       },
    'T1190': { name: 'Exploit Public-Facing Application',       tactic: 'initial-access'       },
    'T1195': { name: 'Supply Chain Compromise',                 tactic: 'initial-access'       },
    'T1566': { name: 'Phishing',                                tactic: 'initial-access'       },
    'T1133': { name: 'External Remote Services',                tactic: 'initial-access'       },
    'T1078': { name: 'Valid Accounts',                          tactic: 'initial-access'       },
    'T1199': { name: 'Trusted Relationship',                    tactic: 'initial-access'       },

    // Execution
    'T1059': { name: 'Command and Scripting Interpreter',       tactic: 'execution'            },
    'T1203': { name: 'Exploitation for Client Execution',       tactic: 'execution'            },
    'T1204': { name: 'User Execution',                          tactic: 'execution'            },
    'T1047': { name: 'WMI',                                     tactic: 'execution'            },
    'T1053': { name: 'Scheduled Task/Job',                      tactic: 'execution'            },
    'T1569': { name: 'System Services',                         tactic: 'execution'            },

    // Persistence
    'T1547': { name: 'Boot or Logon Autostart Execution',       tactic: 'persistence'          },
    'T1543': { name: 'Create or Modify System Process',         tactic: 'persistence'          },
    'T1546': { name: 'Event Triggered Execution',               tactic: 'persistence'          },
    'T1136': { name: 'Create Account',                          tactic: 'persistence'          },
    'T1574': { name: 'Hijack Execution Flow',                   tactic: 'persistence'          },

    // Privilege Escalation
    'T1068': { name: 'Exploitation for Privilege Escalation',   tactic: 'privilege-escalation' },
    'T1548': { name: 'Abuse Elevation Control Mechanism',       tactic: 'privilege-escalation' },
    'T1134': { name: 'Access Token Manipulation',               tactic: 'privilege-escalation' },

    // Defense Evasion
    'T1027': { name: 'Obfuscated Files or Information',         tactic: 'defense-evasion'      },
    'T1055': { name: 'Process Injection',                       tactic: 'defense-evasion'      },
    'T1036': { name: 'Masquerading',                            tactic: 'defense-evasion'      },
    'T1562': { name: 'Impair Defenses',                         tactic: 'defense-evasion'      },
    'T1218': { name: 'System Binary Proxy Execution',           tactic: 'defense-evasion'      },
    'T1112': { name: 'Modify Registry',                         tactic: 'defense-evasion'      },
    'T1070': { name: 'Indicator Removal',                       tactic: 'defense-evasion'      },
    'T1211': { name: 'Exploitation for Defense Evasion',        tactic: 'defense-evasion'      },

    // Credential Access
    'T1003': { name: 'OS Credential Dumping',                   tactic: 'credential-access'    },
    'T1110': { name: 'Brute Force',                             tactic: 'credential-access'    },
    'T1555': { name: 'Credentials from Password Stores',        tactic: 'credential-access'    },
    'T1539': { name: 'Steal Web Session Cookie',                tactic: 'credential-access'    },
    'T1552': { name: 'Unsecured Credentials',                   tactic: 'credential-access'    },
    'T1557': { name: 'Adversary-in-the-Middle',                 tactic: 'credential-access'    },
    'T1558': { name: 'Steal or Forge Kerberos Tickets',         tactic: 'credential-access'    },
    'T1556': { name: 'Modify Authentication Process',           tactic: 'credential-access'    },
    'T1212': { name: 'Exploitation for Credential Access',      tactic: 'credential-access'    },

    // Discovery
    'T1082': { name: 'System Information Discovery',            tactic: 'discovery'            },
    'T1083': { name: 'File and Directory Discovery',            tactic: 'discovery'            },
    'T1049': { name: 'System Network Connections Discovery',    tactic: 'discovery'            },
    'T1016': { name: 'System Network Configuration Discovery',  tactic: 'discovery'            },
    'T1018': { name: 'Remote System Discovery',                 tactic: 'discovery'            },
    'T1057': { name: 'Process Discovery',                       tactic: 'discovery'            },
    'T1135': { name: 'Network Share Discovery',                 tactic: 'discovery'            },
    'T1069': { name: 'Permission Groups Discovery',             tactic: 'discovery'            },

    // Lateral Movement
    'T1021': { name: 'Remote Services',                         tactic: 'lateral-movement'     },
    'T1210': { name: 'Exploitation of Remote Services',         tactic: 'lateral-movement'     },
    'T1570': { name: 'Lateral Tool Transfer',                   tactic: 'lateral-movement'     },
    'T1563': { name: 'Remote Service Session Hijacking',        tactic: 'lateral-movement'     },

    // Collection
    'T1005': { name: 'Data from Local System',                  tactic: 'collection'           },
    'T1074': { name: 'Data Staged',                             tactic: 'collection'           },
    'T1560': { name: 'Archive Collected Data',                  tactic: 'collection'           },
    'T1113': { name: 'Screen Capture',                          tactic: 'collection'           },
    'T1119': { name: 'Automated Collection',                    tactic: 'collection'           },
    'T1114': { name: 'Email Collection',                        tactic: 'collection'           },

    // Command and Control
    'T1071': { name: 'Application Layer Protocol',              tactic: 'command-and-control'  },
    'T1105': { name: 'Ingress Tool Transfer',                   tactic: 'command-and-control'  },
    'T1571': { name: 'Non-Standard Port',                       tactic: 'command-and-control'  },
    'T1572': { name: 'Protocol Tunneling',                      tactic: 'command-and-control'  },
    'T1573': { name: 'Encrypted Channel',                       tactic: 'command-and-control'  },
    'T1090': { name: 'Proxy',                                   tactic: 'command-and-control'  },

    // Exfiltration
    'T1041': { name: 'Exfiltration Over C2 Channel',            tactic: 'exfiltration'         },
    'T1048': { name: 'Exfiltration Over Alternative Protocol',  tactic: 'exfiltration'         },
    'T1567': { name: 'Exfiltration Over Web Service',           tactic: 'exfiltration'         },
    'T1029': { name: 'Scheduled Transfer',                      tactic: 'exfiltration'         },

    // Impact
    'T1486': { name: 'Data Encrypted for Impact',              tactic: 'impact'               },
    'T1485': { name: 'Data Destruction',                        tactic: 'impact'               },
    'T1489': { name: 'Service Stop',                            tactic: 'impact'               },
    'T1490': { name: 'Inhibit System Recovery',                 tactic: 'impact'               },
    'T1498': { name: 'Network Denial of Service',               tactic: 'impact'               },
    'T1499': { name: 'Endpoint Denial of Service',              tactic: 'impact'               },
    'T1496': { name: 'Resource Hijacking',                      tactic: 'impact'               },
    'T1491': { name: 'Defacement',                              tactic: 'impact'               },
    'T1565': { name: 'Data Manipulation',                       tactic: 'impact'               },
};

/**
 * Look up a technique by T-code. Handles sub-technique codes (e.g. T1059.001)
 * by falling back to the parent technique.
 * @param {string} tcode - e.g. 'T1068', 'T1059.001'
 * @returns {{ tcode: string, name: string, tactic: string, tacticLabel: string, colour: string }|null}
 */
export function lookupTechnique(tcode) {
    if (!tcode) return null;
    const normalised = tcode.trim().toUpperCase();
    let entry = TECHNIQUES[normalised];

    // Fallback: strip sub-technique suffix  T1059.001 → T1059
    if (!entry && normalised.includes('.')) {
        entry = TECHNIQUES[normalised.split('.')[0]];
    }
    if (!entry) return null;

    const tacticMeta = TACTICS[entry.tactic] || { label: entry.tactic, colour: '#6c757d' };
    return {
        tcode: normalised,
        name: entry.name,
        tactic: entry.tactic,
        tacticLabel: tacticMeta.label,
        colour: tacticMeta.colour,
    };
}

/**
 * Parse a comma-separated string of T-codes into enriched technique objects.
 * @param {string} raw - e.g. 'T1189,T1068,T1059'
 * @returns {Array<{ tcode, name, tactic, tacticLabel, colour }>}
 */
export function parseMitreTechniques(raw) {
    if (!raw || typeof raw !== 'string') return [];
    return raw.split(',')
        .map(t => lookupTechnique(t.trim()))
        .filter(Boolean);
}
