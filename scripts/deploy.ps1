[CmdletBinding()]
param(
    [string]$SshTarget = 'cet-listening-server',
    [string]$SiteRoot = '/var/www/cet-listening',
    [string]$ProductionUrl = 'https://www.listening.website',
    [string]$ProductionIp = '101.43.10.196',
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$appRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$distPath = Join-Path $appRoot 'dist'
$packagePath = Join-Path $appRoot 'deploy-static.zip'
$remotePackage = '/tmp/cet-listening-release.zip'
$remoteScript = '/tmp/cet-listening-install.sh'

Import-Module (Join-Path $PSScriptRoot 'Deploy.Package.psm1') -Force
Import-Module (Join-Path $PSScriptRoot 'Deploy.Hash.psm1') -Force

function Invoke-Checked([string]$Program, [string[]]$Arguments) {
    & $Program @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Program failed with exit code $LASTEXITCODE" }
}

Push-Location $appRoot
try {
    if (-not $SkipBuild) {
        Write-Host '[1/6] Building production bundle...' -ForegroundColor Cyan
        Invoke-Checked 'pnpm' @('build')
    }

    Write-Host '[2/6] Validating and packaging (data/audio excluded)...' -ForegroundColor Cyan
    Assert-DeployArtifact -DistPath $distPath
    New-DeployPackage -DistPath $distPath -PackagePath $packagePath
    $indexHash = Get-Sha256FileHash -Path (Join-Path $distPath 'index.html')

    $target = $SshTarget
    Write-Host '[3/6] Uploading to a temporary server directory...' -ForegroundColor Cyan
    Invoke-Checked 'scp' @($packagePath, ("${target}:${remotePackage}"))
    Invoke-Checked 'scp' @((Join-Path $PSScriptRoot 'server-install.sh'), ("${target}:${remoteScript}"))

    Write-Host '[4/6] Backing up and switching the live version...' -ForegroundColor Cyan
    Invoke-Checked 'ssh' @($target, "chmod +x '$remoteScript' && '$remoteScript' '$SiteRoot' '$remotePackage'")

    Write-Host '[5/6] Verifying release identity and public HTTPS...' -ForegroundColor Cyan
    Invoke-Checked 'ssh' @($target, "echo '$indexHash  $SiteRoot/index.html' | sha256sum --check --status")
    Invoke-Checked 'ssh' @($target, "curl -fsSIL --max-time 20 --resolve www.listening.website:443:127.0.0.1 https://www.listening.website >/dev/null")
    Invoke-Checked 'curl.exe' @('-4', '--noproxy', '*', '--resolve', "www.listening.website:443:$ProductionIp", '-fsSIL', '--retry', '2', '--retry-all-errors', '--max-time', '30', $ProductionUrl)

    Write-Host '[6/6] Release finished. Verify login, learning, and audio in a private window.' -ForegroundColor Green
}
finally {
    Pop-Location
}
