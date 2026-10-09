$ErrorActionPreference = 'Stop'

$appRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$modulePath = Join-Path $PSScriptRoot 'Deploy.Package.psm1'
$hashModulePath = Join-Path $PSScriptRoot 'Deploy.Hash.psm1'

if (-not (Test-Path -LiteralPath $modulePath)) {
    throw "Missing deployment packaging module: $modulePath"
}

Import-Module $modulePath -Force
Import-Module $hashModulePath -Force

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("cet-deploy-test-" + [guid]::NewGuid())
$distPath = Join-Path $tempRoot 'dist'
$packagePath = Join-Path $tempRoot 'release.zip'

try {
    New-Item -ItemType Directory -Path (Join-Path $distPath 'assets') -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $distPath 'data\audio') -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $distPath 'promo') -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $distPath 'index.html') -Value '<!doctype html>'
    Set-Content -LiteralPath (Join-Path $distPath 'sw.js') -Value 'service worker'
    Set-Content -LiteralPath (Join-Path $distPath 'assets\app.js') -Value 'application'
    Set-Content -LiteralPath (Join-Path $distPath 'data\audio\must-not-upload.mp3') -Value 'audio'
    Set-Content -LiteralPath (Join-Path $distPath 'data\cards.json') -Value '{"cards":[]}'
    Set-Content -LiteralPath (Join-Path $distPath 'promo\preview.mp4') -Value 'promo media'

    Assert-DeployArtifact -DistPath $distPath

    $hashFixture = Join-Path $tempRoot 'hash-fixture.txt'
    [System.IO.File]::WriteAllText($hashFixture, 'abc', [System.Text.Encoding]::ASCII)
    $actualHash = Get-Sha256FileHash -Path $hashFixture
    $expectedHash = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    if ($actualHash -ne $expectedHash) {
        throw "SHA-256 fallback returned '$actualHash' instead of '$expectedHash'"
    }

    New-DeployPackage -DistPath $distPath -PackagePath $packagePath

    if (-not (Test-Path -LiteralPath $packagePath)) {
        throw 'Deployment archive was not created'
    }

    $extractPath = Join-Path $tempRoot 'extracted'
    Expand-Archive -LiteralPath $packagePath -DestinationPath $extractPath

    foreach ($required in @('index.html', 'sw.js', 'assets\app.js', 'data\cards.json', 'promo\preview.mp4')) {
        if (-not (Test-Path -LiteralPath (Join-Path $extractPath $required))) {
            throw "Deployment archive is missing required file: $required"
        }
    }

    if (Test-Path -LiteralPath (Join-Path $extractPath 'data\audio')) {
        throw 'Deployment archive must not contain the audio directory'
    }

    $frontendPackage = Join-Path $tempRoot 'frontend.zip'
    $frontendExtract = Join-Path $tempRoot 'frontend-extracted'
    New-DeployPackage -DistPath $distPath -PackagePath $frontendPackage -FrontendOnly
    Expand-Archive -LiteralPath $frontendPackage -DestinationPath $frontendExtract
    foreach ($required in @('index.html', 'sw.js', 'assets\app.js')) {
        if (-not (Test-Path -LiteralPath (Join-Path $frontendExtract $required))) {
            throw "Frontend archive is missing required file: $required"
        }
    }
    foreach ($excluded in @('data', 'promo')) {
        if (Test-Path -LiteralPath (Join-Path $frontendExtract $excluded)) {
            throw "Frontend archive must not contain $excluded"
        }
    }
    foreach ($preserved in @('data\cards.json', 'data\audio\must-not-upload.mp3', 'promo\preview.mp4')) {
        if (-not (Test-Path -LiteralPath (Join-Path $distPath $preserved))) {
            throw "Packaging modified source: $preserved"
        }
    }
    $selectedPackage = Join-Path $tempRoot 'selected.zip'
    $selectedExtract = Join-Path $tempRoot 'selected-extracted'
    New-DeployPackage -DistPath $distPath -PackagePath $selectedPackage -FrontendOnly -IncludeDataFile cards.json
    Expand-Archive -LiteralPath $selectedPackage -DestinationPath $selectedExtract
    if (-not (Test-Path -LiteralPath (Join-Path $selectedExtract 'data\cards.json'))) { throw 'Selected JSON missing' }
    if (Test-Path -LiteralPath (Join-Path $selectedExtract 'data\audio')) { throw 'Selected package includes audio' }
    foreach ($invalid in @('../cards.json', 'audio', 'missing.json', 'cards.json/other')) {
        $rejected = $false
        try { New-DeployPackage -DistPath $distPath -PackagePath (Join-Path $tempRoot 'invalid.zip') -FrontendOnly -IncludeDataFile $invalid }
        catch { $rejected = $true }
        if (-not $rejected) { throw "Accepted invalid selected data file: $invalid" }
    }
    Write-Host 'PASS: packaging exclusion, selected JSON validation, and source preservation.' -ForegroundColor Green
}
finally {
    if (Test-Path -LiteralPath $tempRoot) {
        $cleanupPath = (Resolve-Path -LiteralPath $tempRoot).Path
        $tempParent = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\', '/')
        if ((Split-Path -Parent $cleanupPath) -ne $tempParent -or
            (Split-Path -Leaf $cleanupPath) -notmatch '^cet-deploy-test-[0-9a-f-]{36}$') {
            throw "Refusing unexpected test cleanup path: $cleanupPath"
        }
        Remove-Item -LiteralPath $cleanupPath -Recurse -Force
    }
}
