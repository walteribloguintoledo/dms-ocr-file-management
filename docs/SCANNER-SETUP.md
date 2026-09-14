# Local scanner setup

`ERR_CONNECTION_REFUSED` at `https://localhost:17483/scanners` means the browser could not establish a connection to the local bridge. It is not an API login error. The bridge must run on the same workstation as the browser and scanner.

1. Install the fi-7180-compatible PaperStream IP TWAIN driver and NAPS2. Verify a duplex test scan works in NAPS2 first.
2. Copy `scanner-bridge/.env.example` to `scanner-bridge/.env`. Set `NAPS2_EXE` to the actual installed `NAPS2.Console.exe` path and `DMS_API_URL` to the running API, such as `http://127.0.0.1:4000/api`.
3. Set `BRIDGE_TLS_CERT` and `BRIDGE_TLS_KEY` to PEM files for a trusted local certificate valid for `localhost`. Use your organization's certificate provisioning process. Do not disable certificate verification or switch the bridge to plain HTTP.
4. Set `BRIDGE_ALLOWED_ORIGINS` to the actual web origins. For local development, the template includes `http://127.0.0.1:3000` and `http://localhost:3000`.
5. In a separate terminal at the project root, run `npm run scanner:bridge` and keep that terminal running. If it exits, address its startup error. A successful start reports `https://localhost:17483`.
6. Sign in as an administrator or encoder, then select **Check scanner**. Allow local-network browser access if prompted.

If the connection is still refused, check that the bridge process remains running and that local firewall rules permit the connection. The bridge binds to IPv4 loopback `127.0.0.1`; if your system resolves `localhost` only to IPv6, use `https://127.0.0.1:17483` only with a certificate that also includes `127.0.0.1` as an IP subject alternative name.

Until setup is complete, use **Import pages** with files exported from your scanning application. Importing does not require the bridge. S3 configuration is separately required before uploading files to the DMS; an upload HTTP 503 with a storage-configuration message is unrelated to the local scanner connection.

Use the same hostname consistently for local web and API addresses (both `127.0.0.1` or both `localhost`) so refresh cookies meet SameSite rules. Restart the API after backend configuration or code changes, and sign in again if the signing key changed.
