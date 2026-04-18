#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Generate SRI (Subresource Integrity) hashes for CDN resources in HTML files

.DESCRIPTION
    This script parses HTML include files, extracts CDN URLs from <link> and <script> tags,
    downloads resources, generates SHA-384 integrity hashes, and updates the HTML files in place.

.PARAMETER IncludePath
    Path to the CDN includes directory (default: portal/.cdn-includes)

.PARAMETER ForceRegenerate
    Force regeneration of all hashes even if they exist

.EXAMPLE
    .\generate-sri.ps1
    Scan HTML files and update missing integrity hashes

.EXAMPLE
    .\generate-sri.ps1 -ForceRegenerate
    Regenerate all hashes and update HTML files
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)]
    [string]$IncludePath = "portal/.cdn-includes",

    [Parameter(Mandatory=$false)]
    [switch]$ForceRegenerate
)

Write-Host "`n=== SRI Hash Generator for CDN Resources ===`n" -ForegroundColor Cyan

# Function to extract CDN resources from HTML file
function Get-CdnResourcesFromHtml {
    param([string]$FilePath)
    
    if (-not (Test-Path $FilePath)) {
        return @()
    }
    
    $content = Get-Content -Path $FilePath -Raw
    $resources = @()
    
    # Match CSS link tags
    $cssMatches = [regex]::Matches($content, '<link[^>]+href="(https://cdn[^"]+)"[^>]*>')
    foreach ($match in $cssMatches) {
        $url = $match.Groups[1].Value
        $fullTag = $match.Value
        
        # Extract current integrity if exists
        $integrityMatch = [regex]::Match($fullTag, 'integrity="([^"]+)"')
        $currentIntegrity = if ($integrityMatch.Success) { $integrityMatch.Groups[1].Value } else { "" }
        
        $resources += @{
            Url = $url
            Type = 'css'
            CurrentIntegrity = $currentIntegrity
            Name = ($url -replace '.*/([^/]+)$', '$1')
        }
    }
    
    # Match script tags (allow src as first attribute with [^>]* instead of [^>]+)
    $jsMatches = [regex]::Matches($content, '<script[^>]*src="(https://cdn[^"]+)"[^>]*>')
    foreach ($match in $jsMatches) {
        $url = $match.Groups[1].Value
        $fullTag = $match.Value
        
        # Extract current integrity if exists
        $integrityMatch = [regex]::Match($fullTag, 'integrity="([^"]+)"')
        $currentIntegrity = if ($integrityMatch.Success) { $integrityMatch.Groups[1].Value } else { "" }
        
        $resources += @{
            Url = $url
            Type = 'js'
            CurrentIntegrity = $currentIntegrity
            Name = ($url -replace '.*/([^/]+)$', '$1')
        }
    }
    
    return $resources
}

# Scan HTML include files
$htmlFiles = Get-ChildItem -Path $IncludePath -Filter "*.html" -ErrorAction SilentlyContinue

if ($htmlFiles.Count -eq 0) {
    Write-Host "[ERROR] No HTML files found in: $IncludePath" -ForegroundColor Red
    exit 1
}

Write-Host "Scanning HTML files in: $IncludePath" -ForegroundColor Gray
Write-Host ""

# Extract all CDN resources from HTML files
$allResources = @()
foreach ($file in $htmlFiles) {
    $fileResources = Get-CdnResourcesFromHtml -FilePath $file.FullName
    if ($fileResources.Count -gt 0) {
        Write-Host "  Found $($fileResources.Count) resource(s) in: $($file.Name)" -ForegroundColor Gray
        $allResources += $fileResources
    }
}

# Remove duplicates based on URL
$cdnResources = $allResources | Sort-Object -Property Url -Unique

Write-Host "`nFound $($cdnResources.Count) unique CDN resources`n" -ForegroundColor Cyan

$results = @()
$updated = 0
$skipped = 0
$failed = 0

foreach ($resource in $cdnResources) {
    Write-Host "Processing: $($resource.Name)" -ForegroundColor Yellow
    Write-Host "  URL: $($resource.Url)" -ForegroundColor Gray
    
    # Skip if hash exists and not forcing regeneration
    if (-not $ForceRegenerate -and $resource.CurrentIntegrity -and $resource.CurrentIntegrity -ne "") {
        Write-Host "  [SKIP] Hash exists (use -ForceRegenerate to update)" -ForegroundColor Gray
        $resource.Integrity = $resource.CurrentIntegrity
        $results += $resource
        $skipped++
        Write-Host ""
        continue
    }
    
    try {
        # Download the resource
        $response = Invoke-WebRequest -Uri $resource.Url -UseBasicParsing -ErrorAction Stop
        
        # Generate SHA-384 hash
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($response.Content)
        $sha384 = [System.Security.Cryptography.SHA384]::Create()
        $hashBytes = $sha384.ComputeHash($bytes)
        $base64Hash = [Convert]::ToBase64String($hashBytes)
        $newIntegrity = "sha384-$base64Hash"
        
        if ($resource.CurrentIntegrity -eq $newIntegrity) {
            Write-Host "  [OK] Hash verified (unchanged)" -ForegroundColor Green
        }
        else {
            Write-Host "  [OK] New hash: $newIntegrity" -ForegroundColor Green
            if ($resource.CurrentIntegrity) {
                Write-Host "  Old hash: $($resource.CurrentIntegrity)" -ForegroundColor DarkGray
            }
            $updated++
        }
        
        # Update resource object
        $resource.Integrity = $newIntegrity
        $results += $resource
    }
    catch {
        Write-Host "  [ERROR] $($_.Exception.Message)" -ForegroundColor Red
        $resource.Integrity = $resource.CurrentIntegrity
        $results += $resource
        $failed++
    }
    
    Write-Host ""
}

# Update HTML include files in place
Write-Host "`nUpdating HTML include files..." -ForegroundColor Cyan

# Function to update HTML file in place
function Update-HtmlFile {
    param(
        [string]$FilePath,
        [array]$Resources
    )
    
    if (-not (Test-Path $FilePath)) {
        Write-Host "  [WARNING] File not found, skipping: $FilePath" -ForegroundColor Yellow
        return 0
    }
    
    $content = Get-Content -Path $FilePath -Raw
    $originalContent = $content
    $updatedCount = 0
    
    foreach ($resource in $Resources) {
        if (-not $resource.Integrity) {
            continue
        }
        
        # Escape special regex characters in URL
        $escapedUrl = [regex]::Escape($resource.Url)
        
        # Pattern to match and update integrity attribute
        if ($resource.Type -eq 'css') {
            # CSS link tag
            $pattern = "(<link[^>]+href=`"$escapedUrl`"[^>]*?)(?:\s+integrity=`"[^`"]*`")?([^>]*?>)"
        }
        else {
            # JavaScript script tag
            $pattern = "(<script[^>]+src=`"$escapedUrl`"[^>]*?)(?:\s+integrity=`"[^`"]*`")?([^>]*?></script>)"
        }
        
        if ($content -match $pattern) {
            $replacement = "`$1 integrity=`"$($resource.Integrity)`"`$2"
            $content = $content -replace $pattern, $replacement
            $updatedCount++
        }
    }
    
    if ($content -ne $originalContent) {
        Set-Content -Path $FilePath -Value $content -NoNewline
        return $updatedCount
    }
    
    return 0
}

# Update all HTML files in the include directory
$totalUpdated = 0
foreach ($file in $htmlFiles) {
    $fileUpdated = Update-HtmlFile -FilePath $file.FullName -Resources $results
    if ($fileUpdated -gt 0) {
        Write-Host "  [OK] Updated $fileUpdated resource(s) in: $($file.Name)" -ForegroundColor Green
        $totalUpdated += $fileUpdated
    }
    else {
        Write-Host "  [INFO] No changes needed: $($file.Name)" -ForegroundColor Gray
    }
}

# Summary
Write-Host "`n=== Summary ===" -ForegroundColor Cyan
Write-Host "  Hashes generated: $updated" -ForegroundColor Green
Write-Host "  Skipped (unchanged): $skipped" -ForegroundColor Gray
Write-Host "  HTML files updated: $totalUpdated integrity attribute(s)" -ForegroundColor Cyan
if ($failed -gt 0) {
    Write-Host "  Failed: $failed" -ForegroundColor Red
}

Write-Host "`n[OK] SRI generation complete!`n" -ForegroundColor Green

# Return results for potential pipeline use
return $results
