# VILLAGE 360°

A mobile fieldwork application for college-led village research. The public site introduces the project. Signed-in surveyors collect structured observations, administrators manage field assignments and verify findings, and faculty viewers use approved summaries. The application uses conventional counts and grouped statistics.

## Start locally

Install Node.js 22.12+ and npm. Run these commands from the extracted village360 directory.

```sh
npm ci
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
openssl rand -hex 32
```

1. In MongoDB Atlas, select a dedicated project and create a cluster. Create a database user with access limited to the **village360** database and allow connections from your development machine's IP. Copy the driver connection URI into **backend/.env** as MONGODB_URI. Percent-encode special characters in the URI password. A local replica set also works. Record writes use transactions, which require a replica set.
2. Paste the generated random secret into SESSION_SECRET. Set ADMIN_EMAIL and ADMIN_INITIAL_PASSWORD to the initial administrator's details. Choose a unique password of at least 16 characters. The public Vite environment contains only the API URL.
3. Initialize the administrator, remove the bootstrap password from the environment after setup, and start both applications.

```sh
npm run setup-admin -w backend
npm run dev
```

Open http://localhost:5173. Check the API at http://localhost:5000/api/health. Use localhost consistently on both services so the browser can send session cookies.

## First field visit

1. Sign in as administrator. Create a village and its wards, set its pilot targets, create a surveyor account and assign the village.
2. Sign in with the surveyor account. Open Fieldwork, choose Household surveys and select Start form. Explain the study, obtain household consent, fill in each section, review the answers and submit. A local draft stays on that device. A server acknowledgement provides the stored reference.
3. Use Village problems for public issues. Avoid names, phone numbers, exact household addresses, faces and documents in descriptions or photographs. Obtain permission before collecting location information.
4. Have an administrator review submissions and update verification status. Use a faculty viewer account to check approved aggregate results. Pilot targets are fieldwork planning goals. Report findings with sample sizes and collection dates.

## Repository

| Directory | Contents |
| --- | --- |
| frontend | Vite/React client, public site, role-specific workspace, forms, charts and mobile tests |
| backend | Express API, Mongoose models, sessions, reports, administrator setup and integration tests |
| shared | Versioned survey field definitions and validation shared by browser and API |
| docs | Hosting, verification, backups and retention |
| .github/workflows | Automated build, database integration and mobile checks |

## Commands

| Task | Command from the repository root |
| --- | --- |
| Install locked dependencies | npm ci |
| Both development servers | npm run dev |
| Build the frontend | npm run build |
| Start the backend | npm start |
| Integration and validation tests | npm test |
| Install the browser used by mobile tests | npx playwright install chromium |
| Run mobile tests | npm run test:mobile |

The integration suite uses synthetic records and an isolated disposable replica set. It needs access to a MongoDB binary on its first run. Set MONGOMS_SYSTEM_BINARY to an existing mongod binary if downloads are unavailable. To use an installed Chromium for mobile tests, set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to its executable.

See [deployment and operations](docs/operations.md) for production setup.

## GramAgent AI development intelligence

The independent GramAgent application lives in `gramagent/`. It adds aggregate-data integration, persistent LangGraph assessments, evidence-based prioritisation, optional OpenAI/Gemini generation, human approval and impact monitoring. Existing Village 360 fieldwork remains available.

See [GramAgent setup, integration and deployment](gramagent/docs/README.md). Start its interface with `npm run dev:gramagent` after configuring the API and worker.
