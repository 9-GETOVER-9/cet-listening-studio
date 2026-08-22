Set-StrictMode -Version Latest

function Assert-DeployArtifact {
    [CmdletBinding()]
    param([Parameter(Mandatory)][string]$DistPath)

    $resolved = (Resolve-Path -LiteralPath $DistPath -ErrorAction Stop).Path
    foreach ($required in @('index.html', 'assets')) {
        if (-not (Test-Path -LiteralPath (Join-Path $resolved $required))) {
            throw "构建产物缺少必要项目: $required"
        }
    }
}

function New-DeployPackage {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][string]$DistPath,
        [Parameter(Mandatory)][string]$PackagePath
    )

    Assert-DeployArtifact -DistPath $DistPath
    $resolvedDist = (Resolve-Path -LiteralPath $DistPath).Path
    $staging = Join-Path ([System.IO.Path]::GetTempPath()) ("cet-release-" + [guid]::NewGuid())

    try {
        New-Item -ItemType Directory -Path $staging -Force | Out-Null
        Get-ChildItem -LiteralPath $resolvedDist -Force | Where-Object {
            $_.Name -ne 'data'
        } | ForEach-Object {
            Copy-Item -LiteralPath $_.FullName -Destination $staging -Recurse -Force
        }

        $distData = Join-Path $resolvedDist 'data'
        if (Test-Path -LiteralPath $distData) {
            $stagingData = Join-Path $staging 'data'
            New-Item -ItemType Directory -Path $stagingData -Force | Out-Null
            Get-ChildItem -LiteralPath $distData -Force | Where-Object {
                $_.Name -ne 'audio'
            } | ForEach-Object {
                Copy-Item -LiteralPath $_.FullName -Destination $stagingData -Recurse -Force
            }
            if (-not (Get-ChildItem -LiteralPath $stagingData -Force)) {
                Remove-Item -LiteralPath $stagingData -Force
            }
        }

        $parent = Split-Path -Parent $PackagePath
        if ($parent) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
        if (Test-Path -LiteralPath $PackagePath) { Remove-Item -LiteralPath $PackagePath -Force }
        Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $PackagePath -CompressionLevel Optimal
    }
    finally {
        if (Test-Path -LiteralPath $staging) {
            Remove-Item -LiteralPath $staging -Recurse -Force
        }
    }
}

Export-ModuleMember -Function Assert-DeployArtifact, New-DeployPackage
