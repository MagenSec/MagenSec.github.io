#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Start a local development web server for testing the MagenSec portal

.DESCRIPTION
    This script starts a simple HTTP server on port 8080 for local testing.
    It uses 'http-server' package via npx, which doesn't require a global install.
    If Node.js/npm is not found, it will prompt to install via winget.

.PARAMETER Port
    Port number to run the server on (default: 8080)

.PARAMETER Directory
    Directory to serve files from (default: current directory)

.EXAMPLE
    .\start-dev-server.ps1
    Start server on port 8080 serving current directory

.EXAMPLE
    .\start-dev-server.ps1 -Port 3000
    Start server on port 3000
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)]
    [int]$Port = 8080,

    [Parameter(Mandatory=$false)]
    [string]$Directory = "."
)

Write-Host "`n=== MagenSec Local Development Server ===`n" -ForegroundColor Cyan

# Check if npm/npx is installed
$npxCmd = $null

try {
    $npmVersion = npm --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] Found npm: v$npmVersion" -ForegroundColor Green
        $npxCmd = "npx"
    }
}
catch {
    # npm not found
}

# If npm not found, install Node.js automatically
if (-not $npxCmd) {
    Write-Host "[WARNING] Node.js/npm not found on this system" -ForegroundColor Yellow
    Write-Host "Installing Node.js via winget..." -ForegroundColor Cyan
    
    try {
        winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
        
        Write-Host "`n[OK] Node.js installed successfully!" -ForegroundColor Green
        Write-Host "[WARNING] Please restart this script or open a new terminal for PATH changes to take effect." -ForegroundColor Yellow
        Write-Host ""
        exit 0
    }
    catch {
        Write-Host "[ERROR] Failed to install Node.js: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "`nYou can manually install Node.js from: https://nodejs.org/" -ForegroundColor Yellow
        exit 1
    }
}

# Resolve directory path
$fullPath = Resolve-Path $Directory -ErrorAction Stop
Write-Host "Serving directory: $fullPath" -ForegroundColor Gray
Write-Host "Starting server on: http://localhost:$Port" -ForegroundColor Cyan
Write-Host ""
Write-Host "Access the portal at: http://localhost:$Port/portal/" -ForegroundColor Green
Write-Host ""
Write-Host "Press Ctrl+C to stop the server`n" -ForegroundColor Yellow

# Start http-server via npx (no global install needed)
# Note: http-server doesn't support SSI includes. For full SSI support, use a different server.
# The portal app handles missing SSI gracefully by loading scripts from CDN directly.
try {
    Set-Location $fullPath
    Write-Host "[INFO] SSI includes (<!--#include-->) are not processed by http-server." -ForegroundColor Yellow
    Write-Host "[INFO] CDN resources will load from inline scripts instead.`n" -ForegroundColor Yellow
    & npx --yes http-server -p $Port -c-1 --cors
}
catch {
    Write-Host "`n[ERROR] Server error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
finally {
    Write-Host "`nServer stopped" -ForegroundColor Gray
}
