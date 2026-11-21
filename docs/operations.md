# Deployment and operations

## Deploy from GitHub

1. Create a private GitHub repository and push the extracted directory, including the root lockfile. Keep .env files and field data outside Git. The verification workflow runs automatically on pushes and pull requests.
2. Create a dedicated Atlas cluster and database account. Grant read/write access to village360, restrict network access to the backend's outbound IPs or private network, and enable the backup option supported by your Atlas tier. Use a separate project for testing.
3. Deploy the root Dockerfile on a Node-compatible container host. The included Render blueprint references the Dockerfile and /api/health. Review host pricing before provisioning. Set MONGODB_URI, SESSION_SECRET, FRONTEND_URL and NODE_ENV=production. The server listens on the platform's PORT. Set TRUST_PROXY_HOPS for the actual reverse-proxy topology.
4. Use HTTPS sibling domains, for example surveys.college.edu and api.college.edu, for the Vercel frontend and Node API. Set FRONTEND_URL to the exact frontend origin without a trailing slash. Set the Vercel variable VITE_API_BASE_URL to the full backend URL ending in /api. Cookie authentication requires a browser-compatible site arrangement.
5. On Vercel import the repository, select **frontend** as Root Directory, select Vite and enable access to source files outside the root directory so the client can import shared/forms.js. Use npm run build and output dist. Redeploy whenever the public API base URL changes.
6. In the backend host's secure shell, temporarily supply ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD and run node scripts/setup-admin.js from the backend directory. Remove the bootstrap password after completion.

## Check the release

- Request /api/health on the deployed API. Inspect its status and body. From the frontend, sign in and reload a protected page to confirm cookie persistence.
- In a designated test village, create a synthetic household survey. Retrieve the returned reference, verify it, and confirm the appropriate filtered dashboard changes. Retry the same submission and verify that the count is unchanged. Record the test reference and exclude that village from research reports.
- Check an unauthorized request, a surveyor accessing another surveyor's record, and a viewer attempting to edit. Each should be rejected.
- Confirm sign-out revokes the session. Check both forms on a phone and test offline draft recovery before deployment to field teams.

## Operations

Set a documented retention period with the institution. Keep exports and restored snapshots in an access-controlled location. Review role assignments and deactivate completed field accounts. Use device screen locks on survey phones and clear local drafts when handing over equipment. Use photographs only where a location observation requires one. Database backups need the same access controls as live records.

Enable scheduled Atlas snapshots with an institution-approved expiry. Periodically restore one snapshot into an isolated cluster, verify representative record counts, references and private photographs, and record the result. Availability and retention depend on the selected Atlas tier. A source ZIP does not provision monitoring or backups.
