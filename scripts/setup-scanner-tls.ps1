$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$certDir = Join-Path $projectDir 'scanner-bridge/certs'
New-Item -ItemType Directory -Force -Path $certDir | Out-Null
$certPath = Join-Path $certDir 'localhost.pem'
$keyPath = Join-Path $certDir 'localhost-key.pem'
if ((Test-Path -LiteralPath $certPath) -or (Test-Path -LiteralPath $keyPath)) {
    $cert = [System.Security.Cryptography.X509Certificates.X509Certificate2]::CreateFromPem([IO.File]::ReadAllText($certPath))
} else {
$rsa = [System.Security.Cryptography.RSA]::Create(3072)
$request = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new('CN=localhost', $rsa, [System.Security.Cryptography.HashAlgorithmName]::SHA256, [System.Security.Cryptography.RSASignaturePadding]::Pkcs1)
$san = [System.Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
$san.AddDnsName('localhost')
$san.AddIpAddress([System.Net.IPAddress]::Parse('127.0.0.1'))
$san.AddIpAddress([System.Net.IPAddress]::Parse('::1'))
$request.CertificateExtensions.Add($san.Build())
$request.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($false,$false,0,$true))
$oids = [System.Security.Cryptography.OidCollection]::new()
$oids.Add([System.Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.1')) | Out-Null
$request.CertificateExtensions.Add([System.Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($oids,$true))
$cert = $request.CreateSelfSigned([DateTimeOffset]::Now.AddMinutes(-5),[DateTimeOffset]::Now.AddDays(365))
[System.IO.File]::WriteAllText($keyPath,$rsa.ExportPkcs8PrivateKeyPem())
[System.IO.File]::WriteAllText($certPath,$cert.ExportCertificatePem())
$rsa.Dispose()
}
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls $keyPath /inheritance:r /grant:r "${identity}:(F)" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Could not secure certificate key permissions." }
$store = [System.Security.Cryptography.X509Certificates.X509Store]::new('Root','CurrentUser')
try {
    $store.Open('ReadWrite')
    $publicCert = [System.Security.Cryptography.X509Certificates.X509Certificate2]::CreateFromPem([IO.File]::ReadAllText($certPath))
    $store.Add($publicCert)
} finally { $store.Close() }
$envPath = Join-Path $projectDir 'scanner-bridge/.env'
$contents = [System.IO.File]::ReadAllText($envPath)
foreach ($entry in @{BRIDGE_TLS_CERT=$certPath;BRIDGE_TLS_KEY=$keyPath}.GetEnumerator()) {
    $line = $entry.Key + '="' + $entry.Value.Replace('\','/') + '"'
    if ($contents -match ('(?m)^'+$entry.Key+'=')) { $contents = [regex]::Replace($contents,'(?m)^'+$entry.Key+'=.*$', $line) }
    else { $contents += "`n$line`n" }
}
[System.IO.File]::WriteAllText($envPath,$contents)
Write-Output ('Configured localhost HTTPS. Certificate thumbprint: '+$cert.Thumbprint)
