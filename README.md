# Folio DMS

A document management workspace for the Fujitsu fi-7180, using Next.js, NestJS, PostgreSQL, Prisma, AWS Amplify, and Amazon S3.

## Start the demo

Requires Node.js 22 and npm. No cloud account or database is needed for the demo.

```powershell
npm ci
npm run dev
```

Open http://127.0.0.1:3000. The explicitly labeled demo uses sample records and keeps changes and imported files in tab memory. Only device preferences are persisted in browser storage. Reloading resets the demo.

On this workstation, the global npm wrapper points to a missing installation. The working fallback is:

```powershell
node "C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js" run dev
```

## Connect the live API

1. Provision PostgreSQL, or use `compose.yaml` with a `POSTGRES_PASSWORD` environment variable.
2. Copy `.env.example` to `.env`. Set `DATABASE_URL`, a random `JWT_SECRET` of at least 32 characters, `WEB_ORIGIN`, `AWS_REGION`, and `S3_BUCKET`. Never commit credentials.
3. Configure a versioned private S3 bucket. `infra/storage.yaml` creates storage with encryption, HTTPS enforcement, CORS, and expiration of staging objects. Attach the narrow policy in `infra/api-role-policy.json` to the API's runtime role after replacing `YOUR_BUCKET`.
4. Generate the client, apply migrations, and provision the first administrator:

```powershell
npm run db:generate
npm run db:migrate
# Set ADMIN_EMAIL, ADMIN_NAME, and ADMIN_PASSWORD in .env before this command.
npm run db:seed
npm run dev:api
```

5. In the web workspace's Settings, enter `http://127.0.0.1:4000/api` for local development, save, and sign in. Production API URLs must use HTTPS.

The API fails startup if its required configuration is missing. It never falls back to sample data. Seed creates an administrator only if that email does not already exist, and never resets an existing password.

## Scanner bridge

1. Install Ricoh/PFU's [PaperStream IP TWAIN driver](https://www.pfu.ricoh.com/global/scanners/fi/support/software/ps-ip-twain64-fi-7x40.html) compatible with the fi-7180 and [NAPS2](https://www.naps2.com/).
2. Confirm the scanner is listed by `NAPS2.Console.exe --listdevices --driver twain` and test duplex scanning in NAPS2.
3. Copy `scanner-bridge/.env.example` to `scanner-bridge/.env`. Set the executable path, a trusted local HTTPS certificate and private key, and the exact allowed web origins. Use your organization's certificate provisioning process; do not disable certificate verification.
4. Run `npm run scanner:bridge`, then select **Check scanner** in the workspace.

The bridge binds only to 127.0.0.1:17483 and rejects requests from unlisted origins. It serializes scanner jobs, restricts scan arguments, uses no shell interpolation, checks batch size, and removes each generated temporary batch directory after processing. Scanning uses the fi-7180 TWAIN device, ADF or duplex source, selected DPI, color, and page size. Browser local-network access may require permission.

The bridge's protocol is `GET /scanners`, `POST /scan`, and `POST /convert`. Scan returns ordered PNG pages as data URLs. Conversion accepts PDF bytes and `X-Output-Format: pdfa`, `tiff`, or `jpg`. Multi-page JPG export produces one queued document per page; TIFF retains multiple pages. See [NAPS2 command-line reference](https://www.naps2.com/doc/command-line) for driver and export options.

PDF/A-2b output uses NAPS2 conversion and requires `JAVA_EXE` and `VERAPDF_JAR` to validate the result. A conversion that fails validation is not returned or uploaded. These external tools and the physical scanner were not available for hardware validation here.

## Implemented flows

- Dashboard, Scan, Documents, Upload Queue, Settings, Logs, and About.
- PDF/JPG/PNG/TIFF page import, zoom, page selection, both rotations, deletion, reordering, adding/replacing pages, rescan, percentage-based crop, and blank-page suggestions/removal.
- Tesseract OCR per page, combined OCR text, progress, cancellation, and additional language codes. Initial recognition downloads language/worker assets; page images are processed in the browser rather than sent to an OCR vendor.
- Ordered A4/Letter/Legal PDF generation, invisible English OCR text with word positioning, and SHA-256. Rotation or crop invalidates OCR for the affected page so text does not retain incorrect coordinates.
- Metadata capture and editing, employee/reference/title/OCR search, department grouping, workflow status filtering, file preview/download, current and historical versions, and review/approval/archive actions.
- Direct S3 upload through short-lived signed URLs. Finalization verifies object length, MIME declaration, file signature, and S3's SHA-256 checksum, then copies a pinned S3 version into a permanent key. Metadata, version creation, session completion, and audit recording are transactional. Repeated finalization is idempotent.
- JWT access tokens in memory, rotating hashed refresh tokens in HTTP-only cookies, logout/revocation, login throttling, validation, a 15-minute idle timeout, server-side roles, and confidentiality restrictions.

## API routes

All routes have the `/api` prefix. Send `Origin` matching `WEB_ORIGIN` and `Authorization: Bearer ...` on protected routes. Authentication endpoints require trusted Origin on writes.

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/auth/login`, `/auth/refresh`, `/auth/logout` | Session lifecycle |
| GET | `/documents` | List/search; `q`, `status`, `categoryId`, `from`, `to` |
| GET | `/documents/:id` | Metadata, versions, and history |
| POST | `/documents/upload-url` | Request an S3 PUT URL |
| POST | `/documents` | Finalize an upload and create a document |
| PATCH | `/documents/:id` | Edit metadata or advance workflow |
| DELETE | `/documents/:id` | Administrator soft deletion |
| POST | `/documents/:id/versions` | Finalize a new file version |
| GET | `/documents/:id/download` | Signed download; optional `version` and `inline=true` |
| GET/POST | `/categories` | Read categories / administrator creates a category |
| GET/POST | `/users` | Administrator account management |
| PATCH | `/users/:id` | Administrator changes another user's role |
| GET/POST | `/logs` | Read audit events / submit allowed client processing events |
| GET | `/dashboard`, `/health` | Counters / service reachability |

Upload sequence: login → `/documents/upload-url` with `fileName`, `mimeType`, `fileSize`, and hexadecimal `checksum` → PUT bytes using the returned headers → POST `/documents` with `uploadId`, title, tags, source, metadata, and OCR text. Versions use the same sequence with `documentId` in the upload request and `/documents/:id/versions` for finalization. Never put AWS credentials in the browser.

Roles: administrator has full access; encoders scan/upload/submit for review; reviewers approve/archive; read-only users browse allowed documents. Confidential and Restricted documents are limited to their creator, reviewers, and administrators. Metadata edits reset a document to Uploaded; archived records cannot be edited or versioned. Workflow allows only Uploaded → In review → Approved → Archived.

## AWS deployment

`amplify.yml` builds the Next.js frontend from `apps/web`. Set `AMPLIFY_MONOREPO_APP_ROOT=apps/web` and `NEXT_PUBLIC_DMS_API_URL` in Amplify. The API is a separate Node service; build the root-context `apps/api/Dockerfile` for ECS/Fargate or another managed container host. Supply database/JWT configuration through a secrets manager and S3 access through the service IAM role.

Use a custom frontend/API domain under the same site (for example `dms.example.com` and `api.example.com`) because refresh cookies use SameSite=Strict. Configure the trusted proxy to replace forwarded protocol headers, terminate TLS, and prevent direct access to the API container. Production rejects plain HTTP. PostgreSQL should be private with TLS connections, backups, and migration deployment performed separately. The supplied storage template retains permanent document versions, including soft-deleted records; define your organization's retention policy before production.

No cloud resources are provisioned or deployed by this checkout. AWS Amplify support is documented in [AWS's Next.js guide](https://docs.aws.amazon.com/amplify/latest/userguide/ssr-amplify-support.html).

## Validation and limits

```powershell
npm run typecheck
npm test
npm run build
```

The implementation is an initial application, not a production acceptance sign-off. Live database transactions, S3 IAM/CORS/versioning, hardware duplex behavior, and PDF/A tooling require integration testing in your environment. Important current limits:

- Pending uploads and page previews are memory-only. Closing/reloading the tab loses unfinished work. Retries are user-triggered and capped by the configured retry count.
- Blank detection is a visual heuristic. Automatic removal is opt-in and off by default; test faint documents before enabling it.
- The library and audit list currently return the latest 500 records. Add pagination for a larger archive; database full-text/trigram indexes should replace broad substring searches at scale.
- Additional OCR languages extract and store Unicode text, but the browser PDF text layer currently embeds printable English characters. Use the archival conversion pipeline with appropriate fonts for multilingual searchable PDFs.
- Browser PDF import rasterizes pages for editing. Upload an existing PDF directly when its original vector content and text must be preserved.
- File signatures are checked, but there is no malware scanning or deep PDF/TIFF content sanitizer. Add a quarantine/antivirus stage before production handling of untrusted documents.
- Scan/OCR events submitted by the client are labeled client-reported. Server upload, workflow, authentication, and user-management events are generated by the API.
- The application does not provide audit-log tamper resistance against database administrators. Use a dedicated append-only audit sink for that requirement.
- Temporary location and log levels belong to the installed services. Browser settings do not change operating-system paths or server logging.

See `docs/ACCEPTANCE.md` for the remaining environment-dependent checks.
