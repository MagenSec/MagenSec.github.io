#!/usr/bin/env pwsh
param(
    [string]$OutputFile = "cvrf_products.json",
    [string]$CacheFile = "cvrf_cache.json",
    [int]$MaxUpdates = 1000,
    [int]$DelayMs = 1000,
    [switch]$ForceRefresh,
    [switch]$Debug
)

# Ensure output directory exists
$outputDir = Split-Path $OutputFile -Parent
if ($outputDir -and !(Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

# Load existing cache
$cache = @{}
if ((Test-Path $CacheFile) -and !$ForceRefresh) {
    try {
        $cacheContent = Get-Content $CacheFile -Raw
        $cacheJson = $cacheContent | ConvertFrom-Json
        # Convert PSCustomObject to hashtable for PowerShell compatibility
        $cache = @{}
        foreach ($property in $cacheJson.PSObject.Properties) {
            $key = $property.Name
            $value = $property.Value
            # Ensure the value is stored as string to prevent type conversion issues
            $cache[$key] = if ($value -eq $null) { "" } else { $value.ToString() }
        }
        Write-Host "Loaded cache with $($cache.Count) entries"
        if ($Debug) {
            Write-Host "Cache sample entries:"
            $sampleKeys = $cache.Keys | Select-Object -First 3
            foreach ($key in $sampleKeys) {
                Write-Host "  $key = '$($cache[$key])'"
            }
            Write-Host "PowerShell version: $($PSVersionTable.PSVersion)"
            Write-Host "OS: $($PSVersionTable.OS)"
        }
    }
    catch {
        Write-Warning "Failed to load cache: $($_.Exception.Message)"
        $cache = @{}
    }
}

# Function to parse update ID to date for sorting
function Get-UpdateDate($updateId) {
    if ($updateId -match '^(\d{4})-(\w{3})$') {
        $year = [int]$matches[1]
        $monthMap = @{
            'Jan' = 1; 'Feb' = 2; 'Mar' = 3; 'Apr' = 4; 'May' = 5; 'Jun' = 6
            'Jul' = 7; 'Aug' = 8; 'Sep' = 9; 'Oct' = 10; 'Nov' = 11; 'Dec' = 12
        }
        $month = $monthMap[$matches[2]]
        if ($month) {
            return [DateTime]::new($year, $month, 1)
        }
    }
    return [DateTime]::MinValue
}

# Function to extract products from CVRF XML
function Get-ProductsFromXml($xmlContent, $updateId, $updateTitle, $updateDate) {
    try {
        $xml = [xml]$xmlContent
        $nsManager = New-Object System.Xml.XmlNamespaceManager($xml.NameTable)
        $nsManager.AddNamespace("prod", "http://docs.oasis-open.org/csaf/ns/csaf-cvrf/v1.2/prod")
        $nsManager.AddNamespace("vuln", "http://docs.oasis-open.org/csaf/ns/csaf-cvrf/v1.2/vuln")
        
        # Get all FullProductName elements
        $productNodes = $xml.SelectNodes("//prod:FullProductName", $nsManager)
        if (!$productNodes -or $productNodes.Count -eq 0) {
            $productNodes = $xml.SelectNodes("//*[local-name()='FullProductName']")
        }
        
        if (!$productNodes) {
            Write-Warning "No products found in $updateId"
            return @()
        }
        
        # Deduplicate products, preferring ones with CPE
        $productMap = @{}
        foreach ($node in $productNodes) {
            $productId = $node.GetAttribute("ProductID")
            $cpe = $node.GetAttribute("CPE")
            $name = $node.InnerText.Trim()
            
            if ($productId -and $name) {
                if (!$productMap.ContainsKey($productId) -or ($cpe -and !$productMap[$productId].Cpe)) {
                    # Create ordered dictionary to ensure consistent JSON property order
                    $product = [ordered]@{
                        ProductId = $productId
                        Name = $name
                        UpdateId = $updateId
                        UpdateTitle = $updateTitle
                        UpdateReleaseDate = $updateDate.ToString("yyyy-MM-ddTHH:mm:ssZ")
                        Cpe = if ($cpe) { $cpe } else { $null }
                        CvssBaseScore = $null
                        CvssTemporalScore = $null
                        CvssVector = $null
                        ThreatSeverity = $null
                        ThreatImpact = $null
                        Url = $null          # Will be populated if available
                        FixedBuild = $null   # Will be populated if available
                    }
                    $productMap[$productId] = $product
                }
            }
        }
        
        # Extract additional data for each product
        foreach ($product in $productMap.Values) {
            # Try to find CVSS scores from CVSSScoreSets
            $scoreNodes = $xml.SelectNodes("//vuln:CVSSScoreSets/vuln:ScoreSet[vuln:ProductID='$($product.ProductId)']", $nsManager)
            if (!$scoreNodes -or $scoreNodes.Count -eq 0) {
                $scoreNodes = $xml.SelectNodes("//*[local-name()='CVSSScoreSets']/*[local-name()='ScoreSet'][*[local-name()='ProductID' and text()='$($product.ProductId)']]")
            }
            
            if ($scoreNodes -and $scoreNodes.Count -gt 0) {
                $scoreNode = $scoreNodes[0]
                $baseScore = $scoreNode.SelectSingleNode("vuln:BaseScore", $nsManager)
                $temporalScore = $scoreNode.SelectSingleNode("vuln:TemporalScore", $nsManager)
                $vector = $scoreNode.SelectSingleNode("vuln:Vector", $nsManager)
                
                if (!$baseScore) { $baseScore = $scoreNode.SelectSingleNode("*[local-name()='BaseScore']") }
                if (!$temporalScore) { $temporalScore = $scoreNode.SelectSingleNode("*[local-name()='TemporalScore']") }
                if (!$vector) { $vector = $scoreNode.SelectSingleNode("*[local-name()='Vector']") }
                
                if ($baseScore -and $baseScore.InnerText) { 
                    $product.CvssBaseScore = [decimal]$baseScore.InnerText 
                }
                if ($temporalScore -and $temporalScore.InnerText) { 
                    $product.CvssTemporalScore = [decimal]$temporalScore.InnerText 
                }
                if ($vector -and $vector.InnerText) { 
                    $product.CvssVector = $vector.InnerText 
                }
            }
            
            # Try to find threats
            $threatNodes = $xml.SelectNodes("//vuln:Threats/vuln:Threat[vuln:ProductID='$($product.ProductId)']", $nsManager)
            if (!$threatNodes -or $threatNodes.Count -eq 0) {
                $threatNodes = $xml.SelectNodes("//*[local-name()='Threats']/*[local-name()='Threat'][*[local-name()='ProductID' and text()='$($product.ProductId)']]")
            }
            
            if ($threatNodes) {
                $severities = @()
                $impacts = @()
                
                foreach ($threatNode in $threatNodes) {
                    $type = $threatNode.GetAttribute("Type")
                    $desc = $threatNode.SelectSingleNode("vuln:Description", $nsManager)
                    if (!$desc) { $desc = $threatNode.SelectSingleNode("*[local-name()='Description']") }
                    
                    if ($desc -and $desc.InnerText) {
                        if ($type -eq "Severity") { $severities += $desc.InnerText.Trim() }
                        elseif ($type -eq "Impact") { $impacts += $desc.InnerText.Trim() }
                    }
                }
                
                if ($severities) { $product.ThreatSeverity = ($severities | Sort-Object -Unique) -join ", " }
                if ($impacts) { $product.ThreatImpact = ($impacts | Sort-Object -Unique) -join ", " }
            }
            
            # Try to find remediation info
            $remediationNodes = $xml.SelectNodes("//vuln:Remediations/vuln:Remediation[vuln:ProductID='$($product.ProductId)']", $nsManager)
            if (!$remediationNodes -or $remediationNodes.Count -eq 0) {
                $remediationNodes = $xml.SelectNodes("//*[local-name()='Remediations']/*[local-name()='Remediation'][*[local-name()='ProductID' and text()='$($product.ProductId)']]")
            }
            
            if ($remediationNodes) {
                $vendorFixUrl = $null
                $releaseNotesUrl = $null
                
                foreach ($remNode in $remediationNodes) {
                    $type = $remNode.GetAttribute("Type")
                    $url = $remNode.SelectSingleNode("vuln:URL", $nsManager)
                    $fixedBuild = $remNode.SelectSingleNode("vuln:FixedBuild", $nsManager)
                    
                    if (!$url) { $url = $remNode.SelectSingleNode("*[local-name()='URL']") }
                    if (!$fixedBuild) { $fixedBuild = $remNode.SelectSingleNode("*[local-name()='FixedBuild']") }
                    
                    # Extract FixedBuild
                    if ($fixedBuild -and $fixedBuild.InnerText -and !$product.FixedBuild) {
                        $product.FixedBuild = $fixedBuild.InnerText.Trim()
                    }
                    
                    # Collect URLs by type
                    if ($url -and $url.InnerText) {
                        if ($type -eq "Vendor Fix") {
                            $vendorFixUrl = $url.InnerText.Trim()
                        } elseif ($type -eq "Release Notes") {
                            $releaseNotesUrl = $url.InnerText.Trim()
                        }
                    }
                }
                
                # Set URL: prefer Vendor Fix, fallback to Release Notes
                if ($vendorFixUrl) {
                    $product.Url = $vendorFixUrl
                } elseif ($releaseNotesUrl) {
                    $product.Url = $releaseNotesUrl
                }
            }
        }
        
        return $productMap.Values
    }
    catch {
        Write-Error "Failed to parse XML for $updateId`: $($_.Exception.Message)"
        return @()
    }
}

# Main execution
Write-Host "CVRF Parser - Microsoft Security Updates"
Write-Host "======================================"
Write-Host "PowerShell Version: $($PSVersionTable.PSVersion)"
Write-Host "Platform: $($PSVersionTable.Platform)"
if ($Debug) {
    Write-Host "Parameters:"
    Write-Host "  OutputFile: $OutputFile"
    Write-Host "  CacheFile: $CacheFile"
    Write-Host "  MaxUpdates: $MaxUpdates"
    Write-Host "  DelayMs: $DelayMs"
    Write-Host "  ForceRefresh: $ForceRefresh"
    Write-Host "  Debug: $Debug"
    Write-Host ""
}

try {
    # Get updates from Microsoft API
    Write-Host "Fetching updates from Microsoft API..."
    $response = Invoke-RestMethod -Uri "https://api.msrc.microsoft.com/cvrf/v3.0/updates" -Method GET
    $updates = $response.value
    
    if (!$updates -or $updates.Count -eq 0) {
        Write-Error "No updates found from API"
        exit 1
    }
    
    Write-Host "Found $($updates.Count) updates"
    
    # Sort updates in reverse chronological order (newest first)
    $sortedUpdates = $updates | Sort-Object { Get-UpdateDate $_.ID } -Descending | Select-Object -First $MaxUpdates
    
    Write-Host "Processing $($sortedUpdates.Count) updates in reverse chronological order..."
    
    $allProducts = @()
    $processed = 0
    $skipped = 0
    $hasNewData = $false  # Track if we processed any new data
    
    # Load existing products if output file exists (for when all updates are cached)
    $existingProducts = @()
    if ((Test-Path $OutputFile) -and !$ForceRefresh) {
        try {
            $existingJson = Get-Content $OutputFile | ConvertFrom-Json
            if ($existingJson -and $existingJson.Count -gt 0) {
                $existingProducts = $existingJson
                Write-Host "Loaded $($existingProducts.Count) existing products from $OutputFile"
            }
        }
        catch {
            Write-Warning "Failed to load existing products: $($_.Exception.Message)"
        }
    }
    
    foreach ($update in $sortedUpdates) {
        $processed++
        Write-Host "[$processed/$($sortedUpdates.Count)] Processing: $($update.DocumentTitle)"
        
        # Check cache with case-insensitive fallback for PowerShell Core compatibility
        $cacheKey = $update.ID
        $needsUpdate = $ForceRefresh
        
        if (!$needsUpdate) {
            $cached = $null
            if ($cache.ContainsKey($cacheKey)) {
                $cached = $cache[$cacheKey]
            }
            elseif ($cache.Count -gt 0) {
                # Fallback: case-insensitive lookup for PowerShell Core compatibility
                $matchingKey = $cache.Keys | Where-Object { $_ -ieq $cacheKey } | Select-Object -First 1
                if ($matchingKey) {
                    $cached = $cache[$matchingKey]
                    if ($Debug) { Write-Host "  DEBUG - Used case-insensitive fallback: '$matchingKey'" }
                }
            }
            
            if ($cached -ne $null) {
                # Handle both old and new cache formats
                $cachedReleaseDate = if ($cached -is [string]) { $cached } else { $cached.CurrentReleaseDate }
                if ($Debug) {
                    Write-Host "  DEBUG - CacheKey: '$cacheKey'"
                    Write-Host "  DEBUG - Cached raw: '$cached'"
                    Write-Host "  DEBUG - Cached processed: '$cachedReleaseDate'"
                    Write-Host "  DEBUG - Current: '$($update.CurrentReleaseDate)'"
                    Write-Host "  DEBUG - Types: Cached=$($cachedReleaseDate.GetType().Name), Current=$($update.CurrentReleaseDate.GetType().Name)"
                }
                # Skip comparison if cached value is empty/null (treat as cache miss)
                if ([string]::IsNullOrWhiteSpace($cachedReleaseDate)) {
                    if ($Debug) { Write-Host "  DEBUG - Empty cache value, treating as cache miss" }
                    $needsUpdate = $true
                }
                else {
                    # Normalize both dates to ISO format for reliable comparison
                    try {
                        $cachedDate = [DateTime]::Parse($cachedReleaseDate)
                        $currentDate = [DateTime]::Parse($update.CurrentReleaseDate)
                        $cachedIso = $cachedDate.ToString("yyyy-MM-ddTHH:mm:ssZ")
                        $currentIso = $currentDate.ToString("yyyy-MM-ddTHH:mm:ssZ")
                        
                        if ($cachedIso -eq $currentIso) {
                            Write-Host "  Cached (no changes) - Release: $cachedIso"
                            $skipped++
                            continue
                        }
                        else {
                            Write-Host "  Cache outdated - Cached: $cachedIso, Current: $currentIso"
                        }
                    }
                    catch {
                        Write-Host "  Date parsing error, reprocessing - Cached: '$cachedReleaseDate', Current: '$($update.CurrentReleaseDate)'"
                    }
                }
            }
            else {
                if (!$ForceRefresh) {
                    Write-Host "  Not in cache - will download"
                }
            }
        }
        
        # Download CVRF XML
        if (!$update.CvrfUrl) {
            Write-Host "  Skipping - No CVRF URL"
            $skipped++
            continue
        }
        
        try {
            $xmlContent = Invoke-RestMethod -Uri $update.CvrfUrl -Method GET
            $updateDate = [DateTime]::Parse($update.CurrentReleaseDate)
            
            # Extract products
            $products = Get-ProductsFromXml $xmlContent $update.ID $update.DocumentTitle $updateDate
            
            if ($products.Count -gt 0) {
                # Merge products (skip if newer version already exists)
                $newProducts = @()
                $existingProductIds = $allProducts | ForEach-Object { $_.ProductId }
                
                foreach ($product in $products) {
                    # Skip CBL Mariner and Azure Linux .rpm packages
                    if ($product.Name -and ($product.Name -match "\.rpm on CBL Mariner" -or $product.Name -match "\.rpm on Azure Linux")) {
                        if ($Debug) {
                            $rpmType = if ($product.Name -match "CBL Mariner") { "CBL Mariner" } else { "Azure Linux" }
                            Write-Host "  Skipping $rpmType RPM: $($product.Name)"
                        }
                        continue
                    }
                    
                    if ($product.ProductId -notin $existingProductIds) {
                        $newProducts += $product
                    }
                    else {
                        if ($Debug) {
                            Write-Host "  Skipping ProductId $($product.ProductId): newer version already exists"
                        }
                    }
                }
                
                $allProducts += $newProducts
                Write-Host "  Added $($newProducts.Count) products, skipped $($products.Count - $newProducts.Count)"
                
                # Update cache (simplified key-value format)
                $cache[$cacheKey] = $update.CurrentReleaseDate
                $hasNewData = $true  # Mark that we processed new data
            }
            else {
                Write-Host "  No products found"
                # Still mark as having new data if we processed an update (even with no products)
                $cache[$cacheKey] = $update.CurrentReleaseDate
                $hasNewData = $true
            }
            
            # Delay between requests
            if ($DelayMs -gt 0) {
                Start-Sleep -Milliseconds $DelayMs
            }
        }
        catch {
            Write-Warning "Failed to process $($update.ID): $($_.Exception.Message)"
        }
    }
    
    # Save results
    Write-Host "Saving products to $OutputFile"
    
    # Merge existing and new products, removing duplicates (prefer newer products)
    $finalProducts = @()
    if ($allProducts.Count -gt 0) {
        # We have new products, use them
        $finalProducts = $allProducts
        Write-Host "Using $($finalProducts.Count) newly processed products"
    }
    elseif ($existingProducts.Count -gt 0) {
        # No new products but we have existing ones, use existing
        $finalProducts = $existingProducts
        Write-Host "Using $($finalProducts.Count) existing products (all updates cached)"
    }
    else {
        Write-Host "No products to save"
    }
    
    if ($finalProducts.Count -gt 0) {
        # Sort products by ProductId to ensure consistent ordering
        # Handle both numeric and non-numeric ProductIds
        $sortedProducts = $finalProducts | Sort-Object { 
            $id = $_.ProductId
            # Try to parse as integer, fallback to string comparison
            if ($id -match '^\d+$') {
                [int]$id
            } else {
                # For non-numeric IDs, use string sorting with high numeric prefix to sort after numeric ones
                [int]::MaxValue.ToString() + $id
            }
        }
        $jsonOutput = $sortedProducts | ConvertTo-Json -Depth 10
        # Force LF line endings to prevent CRLF issues in Git
        $jsonOutput -replace "`r`n", "`n" | Set-Content -Path $OutputFile -Encoding UTF8 -NoNewline
        Add-Content -Path $OutputFile -Value "`n" -Encoding UTF8 -NoNewline
    }
    
    # Only update products timestamp if we actually processed new updates
    if ($hasNewData) {
        $cache["products_last_updated"] = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
    }
    
    # Save cache
    $cacheOutput = $cache | ConvertTo-Json -Depth 10
    # Force LF line endings to prevent CRLF issues in Git
    $cacheOutput -replace "`r`n", "`n" | Set-Content -Path $CacheFile -Encoding UTF8 -NoNewline
    Add-Content -Path $CacheFile -Value "`n" -Encoding UTF8 -NoNewline
    
    # Summary
    Write-Host ""
    Write-Host "Summary:"
    Write-Host "Total products: $($finalProducts.Count)"
    Write-Host "Updates processed: $processed"
    Write-Host "Updates skipped: $skipped"
    Write-Host "Products with CPE: $(($finalProducts | Where-Object { $_.Cpe }).Count)"
    Write-Host "Products with CVSS: $(($finalProducts | Where-Object { $_.CvssBaseScore }).Count)"
    Write-Host "Products with FixedBuild: $(($finalProducts | Where-Object { $_.FixedBuild }).Count)"
    Write-Host "Products with URL: $(($finalProducts | Where-Object { $_.Url }).Count)"
    Write-Host "Products with Threat data: $(($finalProducts | Where-Object { $_.ThreatSeverity -or $_.ThreatImpact }).Count)"
    
    exit 0
}
catch {
    Write-Error "Script failed: $($_.Exception.Message)"
    exit 1
}
