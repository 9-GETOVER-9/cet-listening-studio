[CmdletBinding()]
param([string]$SshTarget = 'cet-listening-server')

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $root
try {
    $manifest = Join-Path $root 'output/ielts-cards-private/manifest.json'
    $audioArchive = Join-Path $root 'output/ielts-cards-private/audio.tar'
    & python (Join-Path $root 'tools/export_ielts_audio_cards.py') --output $manifest
    if ($LASTEXITCODE -ne 0) { throw 'IELTS card catalog generation failed' }
    if (Test-Path -LiteralPath $audioArchive) { Remove-Item -LiteralPath $audioArchive -Force }

    & pnpm build
    if ($LASTEXITCODE -ne 0) { throw 'Production build failed' }

    & (Join-Path $PSScriptRoot 'deploy-sync.ps1') -SshTarget $SshTarget
    if ($LASTEXITCODE -ne 0) { throw 'Authenticated audio and catalog service deployment failed' }

    & (Join-Path $PSScriptRoot 'deploy.ps1') -SshTarget $SshTarget -SkipBuild -FrontendOnly
    if ($LASTEXITCODE -ne 0) { throw 'Frontend deployment failed' }

    $stage = Join-Path $root 'output/ielts-cards-private'
    $expectedParent = [System.IO.Path]::GetFullPath((Join-Path $root 'output')).TrimEnd('\', '/')
    if (Test-Path -LiteralPath $stage) {
        $resolvedStage = (Resolve-Path -LiteralPath $stage).Path
        if ([System.IO.Path]::GetDirectoryName($resolvedStage).TrimEnd('\', '/') -ne $expectedParent -or
            [System.IO.Path]::GetFileName($resolvedStage) -ne 'ielts-cards-private') {
            throw "Refusing unexpected generated audio cleanup path: $resolvedStage"
        }
        Remove-Item -LiteralPath $resolvedStage -Recurse -Force
    }
}
finally {
    Pop-Location
}
