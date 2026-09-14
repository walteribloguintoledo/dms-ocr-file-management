# Environment acceptance checks

Run these against a dedicated test database and test S3 bucket before deploying to production.

1. Create an administrator, encoder, reviewer, and read-only account. Confirm role escalation attempts and direct unauthorized HTTP requests fail.
2. Login, refresh twice, replay the first refresh token, logout, and retry the previous access token. Replay and revoked access must fail.
3. Upload a real PDF using a signed URL. Change the bytes, declared MIME, extension, checksum, and declared length in separate negative cases. Finalization must reject mismatches.
4. Finalize the same successful upload twice. Confirm exactly one document/version and one server upload event exist.
5. Create concurrent versions. Confirm uniqueness and either successful serial ordering or a retryable conflict; never duplicate version numbers.
6. Submit, approve, archive. Confirm skipped/reversed transitions fail, metadata changes return active records to Uploaded, and archived records cannot be modified.
7. Mark a document Restricted. A different encoder/read-only user must not list it, open it by ID, download it, or see its audit details.
8. Disconnect the network during PUT and finalization. Retry and check idempotency. Confirm failed uploads remain visible and cannot be marked complete by a failed request.
9. Scan a known duplex stack of mixed A4/Letter/Legal pages. Compare page count, front/back order, orientation, resolution, and output readability to the original.
10. Test faint stamps and nearly blank pages before enabling a blank-page removal policy. Ensure OCR cancellation stops processing and retains completed page text.
11. Import a multi-page TIFF and PDF; rotate, crop, replace, reorder, and delete pages. Compare exported pages and searchable text with the reviewed order.
12. Generate PDF/A and independently validate the delivered file with veraPDF. Check multilingual font coverage if additional OCR languages are required.
13. Test production TLS, cookie SameSite behavior, exact CORS origins, the proxy trust boundary, S3 public-access blocking, least-privilege IAM, and database backups/restoration.
14. Test idle expiry, multiple open tabs, browser closure with pending work, file-size limits, and large batches on the actual encoder workstation.
