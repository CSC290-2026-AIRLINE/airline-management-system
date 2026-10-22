# Run manually against your local development API. Creates one synthetic row and
# clears it after verification; it deliberately preserves the row and audit trail.
[CmdletBinding()]
param(
    [string]$BaseUrl = 'http://localhost:8080',
    [switch]$PauseForStudio
)

$ErrorActionPreference = 'Stop'
$apiRoot = $BaseUrl.TrimEnd('/') + '/api/watchlist'
$secureToken = Read-Host 'Paste the BACKEND accessToken (input is hidden)' -AsSecureString
$token = [System.Net.NetworkCredential]::new('', $secureToken).Password
if ([string]::IsNullOrWhiteSpace($token)) { throw 'An authenticated backend access token is required.' }
$headers = @{ Authorization = "Bearer $token" }
$createdId = $null

function Invoke-WatchlistApi {
    param([string]$Method, [string]$Path = '', [object]$Body)
    $request = @{
        Uri = $apiRoot + $Path
        Method = $Method
        Headers = $headers
        TimeoutSec = 30
        ErrorAction = 'Stop'
    }
    if ($null -ne $Body) {
        $request.ContentType = 'application/json'
        $request.Body = $Body | ConvertTo-Json -Depth 6 -Compress
    }
    try {
        Invoke-RestMethod @request
    } catch {
        $status = if ($null -ne $_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
        $hint = switch ($status) {
            401 { 'Token is missing, expired, or is a Clerk token instead of the backend accessToken.' }
            403 { 'The authenticated staff must have role security and an enabled user account.' }
            400 { 'Request validation failed. Check the API contract.' }
            409 { 'Concurrent change or entry already cleared. Retry with a fresh test run.' }
            0 { 'Cannot reach the backend. Start the backend and database first.' }
            default { 'Check backend startup configuration and database availability.' }
        }
        throw "API $Method $Path failed (HTTP $status). $hint"
    }
}

function Assert-Result {
    param([bool]$Condition, [string]$Message)
    if (!$Condition) { throw "Verification failed: $Message" }
    Write-Host "PASS: $Message"
}

try {
    $countries = Invoke-WatchlistApi -Method Get -Path '/nationalities'
    Assert-Result ($countries.codes -contains 'th') 'Nationality endpoint accepts authenticated security staff'

    $passport = 'TEST' + ([guid]::NewGuid().ToString('N').Substring(0, 12)).ToUpperInvariant()
    $entry = Invoke-WatchlistApi -Method Post -Body @{
        firstName = 'TEST'
        lastName = 'WATCHLIST'
        dateOfBirth = '1990-01-01'
        nationality = 'th'
        passportNumber = $passport
        listType = 'wanted'
        issuingAuthority = 'LOCAL API TEST'
        reason = 'Synthetic data for manual verification'
    }
    $createdId = $entry.id
    Assert-Result (![string]::IsNullOrEmpty($createdId) -and $entry.status -eq 'active') 'Create persisted an active entry'
    Write-Host "Find this ID in Prisma Studio / watchlist_entry: $createdId"

    if ($PauseForStudio) { [void](Read-Host 'Refresh Prisma Studio to inspect the active row, then press Enter') }

    $detail = Invoke-WatchlistApi -Method Get -Path "/$createdId"
    Assert-Result ($detail.passportNumber -eq $passport) 'Detail returns the full synthetic passport for editing'

    $list = Invoke-WatchlistApi -Method Get -Path "?status=active&search=$passport"
    $matched = @($list.items | Where-Object { $_.id -eq $createdId })
    Assert-Result ($matched.Count -eq 1) 'Search finds the new active entry'
    Assert-Result ($matched[0].PSObject.Properties.Name -notcontains 'passportNumber') 'List does not expose the full passport'
    Assert-Result ($matched[0].passportLast4 -eq $passport.Substring($passport.Length - 4)) 'List shows the correct last four characters'

    $edited = Invoke-WatchlistApi -Method Patch -Path "/$createdId" -Body @{ reason = 'Updated by local API test' }
    Assert-Result ($edited.reason -eq 'Updated by local API test' -and $edited.passportNumber -eq $passport) 'Partial edit saves changes and preserves omitted fields'

    $cleared = Invoke-WatchlistApi -Method Post -Path "/$createdId/clear" -Body @{ reason = 'Manual API test completed' }
    Assert-Result ($cleared.status -eq 'cleared' -and $null -ne $cleared.clearedAt) 'Clear preserves the entry with its timestamp'

    $active = Invoke-WatchlistApi -Method Get -Path "?status=active&search=$passport"
    Assert-Result (@($active.items | Where-Object { $_.id -eq $createdId }).Count -eq 0) 'Cleared entry is absent from Active results'
    $history = Invoke-WatchlistApi -Method Get -Path "?status=cleared&search=$passport"
    Assert-Result (@($history.items | Where-Object { $_.id -eq $createdId }).Count -eq 1) 'Cleared entry remains available in history'

    Write-Host "Completed. Refresh watchlist_entry for ID $createdId and audit_log filtered by entity_id."
    Write-Host 'The synthetic row remains Cleared. No existing entries were modified.'
} catch {
    if ($createdId) { Write-Warning "Test stopped. Inspect synthetic entry $createdId; it may still be Active." }
    throw
} finally {
    $headers.Clear()
    $token = $null
    $secureToken = $null
}
