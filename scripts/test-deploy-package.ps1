$ErrorActionPreference = 'Stop'

$appRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$modulePath = Join-Path $PSScriptRoot 'Deploy.Package.psm1'

if (-not (Test-Path -LiteralPath $modulePath)) {
    throw "Missing deployment packaging module: $modulePath"
}

Import-Module $modulePath -Force

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("cet-deploy-test-" + [guid]::NewGuid())
$distPath = Join-Path $tempRoot 'dist'
$packagePath = Join-Path $tempRoot 'release.zip'

try {
    New-Item -ItemType Directory -Path (Join-Path $distPath 'assets') -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $distPath 'data\audio') -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $distPath 'index.html') -Value '<!doctype html>'
    Set-Content -LiteralPath (Join-Path $distPath 'sw.js') -Value 'service worker'
    Set-Content -LiteralPath (Join-Path $distPath 'assets\app.js') -Value 'application'
    Set-Content -LiteralPath (Join-Path $distPath 'data\audio\must-not-upload.mp3') -Value 'audio'

    Assert-DeployArtifact -DistPath $distPath
    New-DeployPackage -DistPath $distPath -PackagePath $packagePath

    if (-not (Test-Path -LiteralPath $packagePath)) {
        throw 'Deployment archive was not created'
    }

    $extractPath = Join-Path $tempRoot 'extracted'
    Expand-Archive -LiteralPath $packagePath -DestinationPath $extractPath

    foreach ($required in @('index.html', 'sw.js', 'assets\app.js')) {
        if (-not (Test-Path -LiteralPath (Join-Path $extractPath $required))) {
            throw "Deployment archive is missing required file: $required"
        }
    }

    if (Test-Path -LiteralPath (Join-Path $extractPath 'data\audio')) {
        throw 'Deployment archive must not contain the audio directory'
    }

    Write-Host 'PASS: artifact validation, packaging, and audio exclusion succeeded.' -ForegroundColor Green
}
finally {
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
}
