[CmdletBinding()]
param(
  [string]$NodePath = "node",
  [string]$PublishUrl = "https://koran.r3ptil.com",
  [string]$Prompt = "Susun dan terbitkan edisi Juara Merdeka sekarang sesuai seluruh tata kerja redaksi.",
  [string]$ResumeSessionId,
  [int]$ResumeStreamIndex,
  [string]$ResumeRequestId,
  [string]$ResumeAnswer = "continue"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$wranglerPath = Join-Path $repoRoot "node_modules/wrangler/bin/wrangler.js"
$evePath = Join-Path $repoRoot "node_modules/eve/bin/eve.js"
$claudeCompatibilityDirectory = Join-Path $repoRoot ".claude"

if (-not $env:OPENAI_API_KEY) {
  throw "OPENAI_API_KEY is not available in the environment."
}

$nodeMajor = & $NodePath -p "Number(process.versions.node.split('.')[0])"
if ($LASTEXITCODE -ne 0 -or [int]$nodeMajor -lt 24) {
  throw "Eve requires Node.js 24 or newer. Pass -NodePath with a compatible executable."
}

$publishSecret = [Convert]::ToBase64String(
  [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(48)
)

$secretUpload = [System.Diagnostics.ProcessStartInfo]::new()
$secretUpload.FileName = $NodePath
$secretUpload.ArgumentList.Add($wranglerPath)
$secretUpload.ArgumentList.Add("secret")
$secretUpload.ArgumentList.Add("put")
$secretUpload.ArgumentList.Add("PUBLISH_SECRET")
$secretUpload.WorkingDirectory = $repoRoot
$secretUpload.UseShellExecute = $false
$secretUpload.RedirectStandardInput = $true
$secretUpload.RedirectStandardOutput = $true
$secretUpload.RedirectStandardError = $true

$process = [System.Diagnostics.Process]::new()
$process.StartInfo = $secretUpload
if (-not $process.Start()) {
  throw "Could not start Wrangler to upload PUBLISH_SECRET."
}
$process.StandardInput.WriteLine($publishSecret)
$process.StandardInput.Close()
$stdout = $process.StandardOutput.ReadToEnd()
$stderr = $process.StandardError.ReadToEnd()
$process.WaitForExit()

if ($process.ExitCode -ne 0) {
  throw "Wrangler could not upload PUBLISH_SECRET: $stderr"
}
$stdout.Trim() | Write-Output

$previousPublishSecret = $env:PUBLISH_SECRET
$previousPublishUrl = $env:CLOUDFLARE_PUBLISH_URL
$heldClaudeDirectory = $null
try {
  # Eve's Windows snapshot copier cannot reproduce the Claude compatibility
  # junctions without elevated symlink privileges. Keep that directory outside
  # the snapshot root for this process, then restore it exactly in finally.
  if (Test-Path -LiteralPath $claudeCompatibilityDirectory) {
    $holdDirectory = Join-Path ([System.IO.Path]::GetTempPath()) (
      "juara-merdeka-claude-links-" + [guid]::NewGuid().ToString("N")
    )
    New-Item -ItemType Directory -Path $holdDirectory | Out-Null
    $heldClaudeDirectory = Join-Path $holdDirectory ".claude"
    Move-Item -LiteralPath $claudeCompatibilityDirectory -Destination $heldClaudeDirectory
  }

  $env:PUBLISH_SECRET = $publishSecret
  $env:CLOUDFLARE_PUBLISH_URL = $PublishUrl
  if ($ResumeSessionId) {
    if (-not $ResumeRequestId -or $ResumeStreamIndex -lt 1) {
      throw "ResumeRequestId and ResumeStreamIndex are required with ResumeSessionId."
    }
    $resumeResult = [ordered]@{
      status = "input-required"
      requests = @(
        [ordered]@{
          allowFreeform = $false
          kind = "session-limit"
          options = @(
            [ordered]@{ description = "Grant a fresh token budget"; id = "continue"; label = "Approve" }
            [ordered]@{ description = "Stop now"; id = "stop"; label = "Stop" }
          )
          prompt = "This session has hit the input-token limit (160K) per session. This is a guardrail against defective long-running sessions. If session activity looks fine, just approve to keep going."
          requestId = $ResumeRequestId
        }
      )
      resume = [ordered]@{
        session = [ordered]@{ sessionId = $ResumeSessionId; streamIndex = $ResumeStreamIndex }
        target = [ordered]@{ kind = "local" }
      }
    } | ConvertTo-Json -Depth 8 -Compress
    $resumeResult | & $NodePath $evePath invoke --resume $ResumeAnswer
  } else {
    & $NodePath $evePath invoke $Prompt
  }
  if ($LASTEXITCODE -ne 0) {
    throw "Eve invocation exited with code $LASTEXITCODE."
  }
} finally {
  $env:PUBLISH_SECRET = $previousPublishSecret
  $env:CLOUDFLARE_PUBLISH_URL = $previousPublishUrl
  if ($heldClaudeDirectory -and (Test-Path -LiteralPath $heldClaudeDirectory)) {
    Move-Item -LiteralPath $heldClaudeDirectory -Destination $claudeCompatibilityDirectory
    Remove-Item -LiteralPath (Split-Path -Parent $heldClaudeDirectory)
  }
}
