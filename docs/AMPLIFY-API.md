# Separate Amplify API application

Use `amplify-api.yml` as the build specification in a NEW Amplify app connected to this repository. Paste it into that app's build settings; the filename is not automatically selected by Amplify. Keep the existing frontend app and its root `amplify.yml` unchanged.

Configure platform `WEB_COMPUTE`, framework `Express` (not Next.js), Node 22, and `AMPLIFY_MONOREPO_APP_ROOT=apps/api` on the API app. The build emits Amplify's custom deployment manifest and runs NestJS on port 3000.

Set API app build environment variables:

- DATABASE_URL
- JWT_SECRET (at least 32 characters)
- WEB_ORIGIN=https://folio.avasiaonline.com
- S3_BUCKET
- AWS_REGION
- MAX_FILE_SIZE_MB (optional)

The allowlisted database/JWT configuration is packaged only in the private compute directory, never static assets. Restrict access to build artifacts; changing these values requires rebuilding. No AWS access keys are packaged. Attach an Amplify compute IAM role with the required S3 object/version permissions. Keep bucket versioning enabled and include the frontend origin in S3 CORS.

Assign the API a same-site custom domain such as api.avasiaonline.com before connecting production login: the API uses SameSite=Strict refresh cookies, which will not work across unrelated amplifyapp.com and avasiaonline.com sites. Verify https://api.avasiaonline.com/api/health returns JSON. Set NEXT_PUBLIC_DMS_API_URL=https://api.avasiaonline.com/api in the FRONTEND app, rebuild it, and update any saved login Connection settings to match.

Database migrations are separate from deployment and should be applied deliberately before releasing code that needs them. This configuration does not run migrations or seed users.

Limitations: Amplify compute has request/runtime and bundle-size limits. The current in-memory login rate limiter is per compute instance and resets on restart; a shared persistent limiter is needed for a global production three-attempt policy. Verify production proxy HTTPS headers, refresh-cookie behavior, database access, and S3 upload/finalize after deployment.

Reference: https://docs.aws.amazon.com/amplify/latest/userguide/deploy-express-server.html
