#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Downloads and verifies third-party portal runtime assets under Web/vendor.

.DESCRIPTION
    The portal is buildless and static-hosted, so runtime dependencies are pinned as
    same-origin files instead of being fetched from a CDN at page load. This script
    keeps those files reproducible: each asset has a source URL, local path, expected
    byte length, and expected SHA-384 integrity hash.

.PARAMETER Download
    Re-download all assets from their pinned upstream URLs before verifying.

.EXAMPLE
    ./scripts/sync-vendor-assets.ps1
    Verify the checked-in vendor assets.

.EXAMPLE
    ./scripts/sync-vendor-assets.ps1 -Download
    Re-download pinned assets and verify their hashes.
#>

[CmdletBinding()]
param(
    [switch]$Download
)

$ErrorActionPreference = 'Stop'

$webRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$vendorRoot = Join-Path $webRoot 'vendor'

$assets = @(
    @{ Name = 'Tabler CSS'; Url = 'https://cdn.jsdelivr.net/npm/@tabler/core@1.0.0-beta20/dist/css/tabler.min.css'; Path = 'tabler/1.0.0-beta20/css/tabler.min.css'; Length = 548265; Sri = 'sha384-GgnF119bh9fxkKuWHRQYSgEe1rSp5jB0EJ2W8eMf8mjowfwhZP2H1u8n8xJUW3FQ' },
    @{ Name = 'Tabler JS'; Url = 'https://cdn.jsdelivr.net/npm/@tabler/core@1.0.0-beta20/dist/js/tabler.min.js'; Path = 'tabler/1.0.0-beta20/js/tabler.min.js'; Length = 136512; Sri = 'sha384-skr6f2xmgHOAc9USAHvYxA0lNy9tzSr5JIkdr9ytaCy2C/ofOu+OWd+d/hsnEJFN' },
    @{ Name = 'Tabler Icons CSS'; Url = 'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.47.0/tabler-icons.min.css'; Path = 'tabler-icons/2.47.0/tabler-icons.min.css'; Length = 203693; Sri = 'sha384-PwEnNZvp50/uDLtKrd1s2D4Xe/y+fCVtEigigjik/PgHlDXUF1uJ32m7guk/XWYV' },
    @{ Name = 'Tabler Icons EOT'; Url = 'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.47.0/fonts/tabler-icons.eot'; Path = 'tabler-icons/2.47.0/fonts/tabler-icons.eot'; Length = 2177564; Sri = 'sha384-FDQ3372fS1as1Q6qHLo4uEEZEsG71pvp43iPI+dkeCh8jIZRihuchfZE6po0PGR/' },
    @{ Name = 'Tabler Icons WOFF2'; Url = 'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.47.0/fonts/tabler-icons.woff2'; Path = 'tabler-icons/2.47.0/fonts/tabler-icons.woff2'; Length = 778812; Sri = 'sha384-adPDf/z4a9j1+GZW89DhXDg/5jQ+0QGl5Xj2VR4g1TYgY9eKgcmZz4bJ9jGuLLGX' },
    @{ Name = 'Tabler Icons WOFF'; Url = 'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.47.0/fonts/tabler-icons.woff'; Path = 'tabler-icons/2.47.0/fonts/tabler-icons.woff'; Length = 1102184; Sri = 'sha384-vROGnOC7sarPbDXBcGKmgYyrPukbHZdN7V37+PS69w5rsuT+cPNS+jLL2rZlepBS' },
    @{ Name = 'Tabler Icons TTF'; Url = 'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@2.47.0/fonts/tabler-icons.ttf'; Path = 'tabler-icons/2.47.0/fonts/tabler-icons.ttf'; Length = 2177380; Sri = 'sha384-ETaYy2CmgYxLJj69ZTVQkX9c4R3IEr8fjohjv3KBkhqwi12MhGe/N3qqJ0mmoF3z' },
    @{ Name = 'Preact'; Url = 'https://cdn.jsdelivr.net/npm/preact@10.19.3/dist/preact.umd.js'; Path = 'preact/10.19.3/preact.umd.js'; Length = 11172; Sri = 'sha384-U4OMVsjjX51xPGffCeL/sA3lRY9728Yr9c2GrxjjKXCqLDmTU3YTMoEo7S3w0zV0' },
    @{ Name = 'Preact Hooks'; Url = 'https://cdn.jsdelivr.net/npm/preact@10.19.3/hooks/dist/hooks.umd.js'; Path = 'preact/10.19.3/hooks.umd.js'; Length = 4015; Sri = 'sha384-dotES0HQfWapSbwVniIh09lILVkW8rHjyp+eRlkP7zfcos3bwARWTh85LJRYp+K2' },
    @{ Name = 'HTM'; Url = 'https://cdn.jsdelivr.net/npm/htm@3.1.1/dist/htm.umd.js'; Path = 'htm/3.1.1/htm.umd.js'; Length = 1364; Sri = 'sha384-toVdrLSMaw7Y55MowcKqkmFL/Ek6Sky62NOk0b5sDDZBu2wcoPyyQUt9unDVjXhL' },
    @{ Name = 'Chart.js'; Url = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'; Path = 'chart.js/4.4.0/chart.umd.min.js'; Length = 205222; Sri = 'sha384-e6nUZLBkQ86NJ6TVVKAeSaK8jWa3NhkYWZFomE39AvDbQWeie9PlQqM3pmYW5d1g' },
    @{ Name = 'Chart.js date adapter'; Url = 'https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns@3.0.0/dist/chartjs-adapter-date-fns.bundle.min.js'; Path = 'chartjs-adapter-date-fns/3.0.0/chartjs-adapter-date-fns.bundle.min.js'; Length = 50650; Sri = 'sha384-cVMg8E3QFwTvGCDuK+ET4PD341jF3W8nO1auiXfuZNQkzbUUiBGLsIQUE+b1mxws' },
    @{ Name = 'ApexCharts'; Url = 'https://cdn.jsdelivr.net/npm/apexcharts@3.45.0/dist/apexcharts.min.js'; Path = 'apexcharts/3.45.0/apexcharts.min.js'; Length = 522124; Sri = 'sha384-AMGf6SjYWuydruLCEKIx7wNrplae/LWMqStBYe5zhISiQeyuogc8OLM2QzJIreuY' },
    @{ Name = 'DOMPurify'; Url = 'https://cdn.jsdelivr.net/npm/dompurify@3.0.8/dist/purify.min.js'; Path = 'dompurify/3.0.8/purify.min.js'; Length = 21074; Sri = 'sha384-vdScihEZCfbPnBQf+lc7LgXUdJVYyhC3yWHUW5C5P5GpHRqVnaM6HJELJxT6IqwM' },
    @{ Name = 'Marked'; Url = 'https://cdn.jsdelivr.net/npm/marked@9.1.6/marked.min.js'; Path = 'marked/9.1.6/marked.min.js'; Length = 36054; Sri = 'sha384-odPBjvtXVM/5hOYIr3A1dB+flh0c3wAT3bSesIOqEGmyUA4JoKf/YTWy0XKOYAY7' },
    @{ Name = 'Mermaid'; Url = 'https://cdn.jsdelivr.net/npm/mermaid@10.6.1/dist/mermaid.min.js'; Path = 'mermaid/10.6.1/mermaid.min.js'; Length = 2935756; Sri = 'sha384-+NGfjU8KzpDLXRHduEqW+ZiJr2rIg+cidUVk7B51R5xK7cHwMKQfrdFwGdrq1Bcz' },
    @{ Name = 'D3'; Url = 'https://cdn.jsdelivr.net/npm/d3@7.8.5/dist/d3.min.js'; Path = 'd3/7.8.5/d3.min.js'; Length = 279633; Sri = 'sha384-su5kReKyYlIFrI62mbQRKXHzFobMa7BHp1cK6julLPbnYcCW9NIZKJiTODjLPeDh' },
    @{ Name = 'Page.js'; Url = 'https://cdn.jsdelivr.net/npm/page@1.11.6/page.min.js'; Path = 'page/1.11.6/page.min.js'; Length = 11635; Sri = 'sha384-I21flNc4c7wK3Q4Zxf/hz43oz5U8ks1jEK2NdsOPELdxzIs9XHBgvBulNBRklYVf' },
    @{ Name = 'Bootstrap'; Url = 'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js'; Path = 'bootstrap/5.3.2/bootstrap.bundle.min.js'; Length = 80663; Sri = 'sha384-C6RzsynM9kWDrMNeT87bh95OGNyZPhcTNXj1NW7RuBCsyN/o0jlpcV8Qyq46cDfL' }
)

function Get-Sha384Integrity {
    param([Parameter(Mandatory=$true)][string]$Path)

    $sha384 = [System.Security.Cryptography.SHA384]::Create()
    try {
        $bytes = [System.IO.File]::ReadAllBytes($Path)
        return 'sha384-' + [Convert]::ToBase64String($sha384.ComputeHash($bytes))
    }
    finally {
        $sha384.Dispose()
    }
}

foreach ($asset in $assets) {
    $target = Join-Path $vendorRoot $asset.Path

    if ($Download -or -not (Test-Path $target)) {
        $directory = Split-Path $target -Parent
        if (-not (Test-Path $directory)) {
            New-Item -ItemType Directory -Path $directory -Force | Out-Null
        }

        Write-Host "Downloading $($asset.Name)" -ForegroundColor Cyan
        Invoke-WebRequest -Uri $asset.Url -OutFile $target -UseBasicParsing
    }

    if (-not (Test-Path $target)) {
        throw "Missing vendor asset: $($asset.Path)"
    }

    $file = Get-Item $target
    if ($file.Length -ne $asset.Length) {
        throw "Length mismatch for $($asset.Path): expected $($asset.Length), got $($file.Length)"
    }

    $actualSri = Get-Sha384Integrity -Path $file.FullName
    if ($actualSri -ne $asset.Sri) {
        throw "Integrity mismatch for $($asset.Path): expected $($asset.Sri), got $actualSri"
    }

    Write-Host "OK $($asset.Path)" -ForegroundColor Green
}

Write-Host "`nVendor asset verification complete." -ForegroundColor Green