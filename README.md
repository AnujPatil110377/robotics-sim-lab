# Docker Remote Desktop Platform (MVP)

This project provisions desktop-ready Docker containers on demand. Two access options are available:

1. **Browser-based XFCE via noVNC** using community images like `accetto/ubuntu-vnc-xfce` (default form values).
2. **Chrome Remote Desktop (CRD)** using the custom image shipped in `images/ubuntu-crd`. Supply a CRD auth code and email to auto-register the host.

## Prerequisites

- Docker Desktop on Windows (WSL2 backend recommended)
- Node.js 18+
- Chrome Remote Desktop account to generate auth codes (`https://remotedesktop.google.com/headless`).

## Backend API

```
cd backend
npm install
npm start
```

The API listens on `http://localhost:3001` and also serves the control UI.

### Endpoints

- `POST /instances` – body: `{ image, internalPort, cpu, ramMb, name, crd: { email, code } }`
- `GET /instances`
- `POST /instances/:id/start|stop|restart`
- `DELETE /instances/:id`

When CRD fields are supplied, the API passes them as `CRD_EMAIL` and `CRD_CODE` environment variables to the container.

## Build the Chrome Remote Desktop image

```
cd images/ubuntu-crd
docker build -t local/ubuntu-crd:latest .
```

Provide the image name in the UI (or API) and include CRD credentials:

```
{
  "image": "local/ubuntu-crd:latest",
  "cpu": 2,
  "ramMb": 4096,
  "crd": {
    "email": "you@example.com",
    "code": "4/XXXXXXXXXXXXX"
  }
}
```

- Optional environment overrides (set in the API payload `env` array or by customizing the image):

- `CRD_PASSWORD` – 6+ digit PIN used when the host registers. This value is NOT baked into the image; it must be provided at container runtime (for example via the UI form or via the API). The API will apply the PIN inside the running container rather than storing it in the image.
- `CRD_HOSTNAME` – name shown in Chrome Remote Desktop (default `Docker-CRD`)
- `CRD_USER` – Linux username created inside the container (`crduser` by default)

### Generating CRD credentials

1. Visit `https://remotedesktop.google.com/headless` and sign in.
2. Choose **Remote Access** → **Set up another computer**.
3. Copy the **Debian Linux** command and extract the auth code (`--code="..."`).
4. Paste the email and code into the UI form.

After the container starts, connect from `https://remotedesktop.google.com/access` using the same Google account.

## Traefik load balancing (optional)

Start Traefik with Docker Compose:

```
docker compose -f deploy/docker-compose-traefik.yml up -d
```

Set `USE_TRAEFIK=1` before `npm start` to publish instances under `http://localhost/i/<instanceId>`.

### How it works

- The API adds Traefik labels to each container so routing happens dynamically.
- Requests to `http://localhost/i/<instanceId>` are stripped to `/` before hitting the container and forwarded to its internal desktop port.
- If you later add more backend hosts, point Traefik at a Docker swarm or Kubernetes cluster and keep the label scheme consistent.

### Scaling tips

- Put Traefik behind a reverse proxy or cloud load balancer when exposing it to the Internet.
- Enable HTTPS by adding a `certificatesResolvers` block (Let’s Encrypt) in a `traefik.yml` file and mounting it via Compose.
- For multi-node deployments switch to Traefik’s Kubernetes CRDs or Docker Swarm provider.

## Monitoring (optional)

```
docker run -d --name=cadvisor \
  -p 8080:8080 \
  --volume=/var/run/docker.sock:/var/run/docker.sock:ro \
  --volume=/var/lib/docker/:/var/lib/docker:ro \
  gcr.io/cadvisor/cadvisor:latest
```

Open `http://localhost:8080` for per-container CPU/RAM stats.

## Future improvements

- **Persistent metadata** – store instance details, quotas, and billing info in a database (e.g., PostgreSQL + Prisma).
- **Authentication & RBAC** – protect the API/UI, add per-user limits and audit logs.
- **Automated cleanup** – implement schedulers to stop idle desktops, rotate CRD hosts, and prune unused images.
- **GPU support** – extend the Dockerfile and host configuration to pass through NVIDIA GPUs for graphics-heavy workloads.
- **Kubernetes operator** – translate the provisioner into a controller that creates pods and services instead of raw Docker containers.
- **Self-service portal** – upgrade the frontend to a full React/Next.js app with OAuth login, usage dashboards, and support ticketing.

Contributions are welcome—file issues or submit PRs with improvements, bug fixes, or additional desktop images.

## Local development & workflow (current)

This section documents the current local development workflow and a few troubleshooting tips so you can reproduce the environment used during testing.

- Start Docker Desktop first (Windows): Docker Compose uses the Docker Desktop WSL2 socket. If `docker` commands fail with a named-pipe error, open Docker Desktop and wait until it reports "Docker Engine running".

- Bring up Traefik and the backend (deploy/ compose lives in `deploy/`):

```powershell
# from repo root
docker compose -f deploy/docker-compose-traefik.yml up -d
```

- Frontend location and mount behavior:
  - The frontend source is in `Admin Dashboard UI Design/` at the repo root. A production build is output to `Admin Dashboard UI Design/build`.
  - The Compose file in `deploy/docker-compose-traefik.yml` mounts the host build directory into the backend container at `/app/backend/public` using the repo-root relative path (`../Admin Dashboard UI Design/build`). This is how Traefik ends up serving the static UI.
  - If you see `Cannot GET /` on `http://localhost`, check that the host build exists and the compose mount is correct (see `docker inspect <backend-container>` and `docker exec <backend-container> ls -la /app/backend/public`).

- Building / serving the frontend for production (served via Traefik):

```powershell
cd "C:\Users\91798\docker_loadbalancing\Admin Dashboard UI Design"
npm install
npm run build
# restart the backend service so the mount is picked up
docker compose -f deploy/docker-compose-traefik.yml up -d backend
```

- Local frontend development (Vite dev server):
  - The Vite dev server is configured with a proxy for API routes (`/instances`, `/monitor`, `/i` etc) which forwards to `http://localhost` (Traefik). This allows the dev server to call the API and use Traefik dynamic routes for `/i/<instanceId>` without CORS issues.

```powershell
cd "C:\Users\91798\docker_loadbalancing\Admin Dashboard UI Design"
npm install
npm run dev
```

- API & dynamic instance routing (quick reminders):
  - API base: backend listens on port 3001 by default. When Traefik is in use, set `USE_TRAEFIK=1` (the Compose file sets this) and the API will create instances with Traefik labels.
  - Instances are reachable at: `http://localhost/i/<instanceId>` (Traefik strips the `/i/<instanceId>` prefix before forwarding to the container's internal port).

- Git notes:
  - This repository uses `master` as the active branch in this workspace. If `git push origin main` fails with `src refspec main does not match any`, push `master` instead:

```powershell
git push origin master
```

  - If you prefer `main`, rename locally and push:

```powershell
git branch -m master main
git push -u origin main
```

- Troubleshooting tips:
  - If the backend container doesn't show your static files, ensure the build path exists on the host and the compose mount uses the repo-root relative path: `../Admin Dashboard UI Design/build` (this was a common cause of empty `/app/backend/public`).
  - Check backend logs with `docker logs <backend-container> --tail 200` and Traefik dashboard at `http://localhost:8080` when debugging routing.

