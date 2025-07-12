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
        $cacheJson = Get-Content $CacheFile | ConvertFrom-Json
        # Convert PSCustomObject to hashtable for PowerShell compatibility
        $cache = @{}
        foreach ($property in $cacheJson.PSObject.Properties) {
            $cache[$property.Name] = $property.Value
        }
        Write-Host "Loaded cache with $($cache.Count) entries"
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
                    $productMap[$productId] = @{
                        ProductId = $productId
                        Name = $name
                        Cpe = if ($cpe) { $cpe } else { $null }
                        UpdateId = $updateId
                        UpdateTitle = $updateTitle
                        UpdateReleaseDate = $updateDate.ToString("yyyy-MM-ddTHH:mm:ssZ")
                        Url = $null          # Will be populated if available
                        FixedBuild = $null   # Will be populated if available
                        CvssBaseScore = $null
                        CvssTemporalScore = $null
                        CvssVector = $null
                        ThreatSeverity = $null
                        ThreatImpact = $null
                    }
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
    
    foreach ($update in $sortedUpdates) {
        $processed++
        Write-Host "[$processed/$($sortedUpdates.Count)] Processing: $($update.DocumentTitle)"
        
        # Check cache
        $cacheKey = $update.ID
        $needsUpdate = $ForceRefresh
        
        if (!$needsUpdate -and $cache.ContainsKey($cacheKey)) {
            $cached = $cache[$cacheKey]
            # Handle both old and new cache formats
            $cachedReleaseDate = if ($cached -is [string]) { $cached } else { $cached.CurrentReleaseDate }
            if ($cachedReleaseDate -eq $update.CurrentReleaseDate) {
                Write-Host "  Cached (no changes)"
                $skipped++
                continue
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
    Write-Host "Saving $($allProducts.Count) products to $OutputFile"
    $allProducts | ConvertTo-Json -Depth 10 | Set-Content -Path $OutputFile -Encoding UTF8
    
    # Only update products timestamp if we actually processed new updates
    if ($hasNewData) {
        $cache["products_last_updated"] = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssZ")
    }
    
    # Save cache
    $cache | ConvertTo-Json -Depth 10 | Set-Content -Path $CacheFile -Encoding UTF8
    
    # Summary
    Write-Host ""
    Write-Host "Summary:"
    Write-Host "Total products: $($allProducts.Count)"
    Write-Host "Updates processed: $processed"
    Write-Host "Updates skipped: $skipped"
    Write-Host "Products with CPE: $(($allProducts | Where-Object { $_.Cpe }).Count)"
    Write-Host "Products with CVSS: $(($allProducts | Where-Object { $_.CvssBaseScore }).Count)"
    Write-Host "Products with FixedBuild: $(($allProducts | Where-Object { $_.FixedBuild }).Count)"
    Write-Host "Products with URL: $(($allProducts | Where-Object { $_.Url }).Count)"
    Write-Host "Products with Threat data: $(($allProducts | Where-Object { $_.ThreatSeverity -or $_.ThreatImpact }).Count)"
    
    exit 0
}
catch {
    Write-Error "Script failed: $($_.Exception.Message)"
    exit 1
}
