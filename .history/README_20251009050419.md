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

Optional environment overrides (set in the API payload `env` array or by customizing the image):

- `CRD_PASSWORD` – 6+ digit PIN used when the host registers (default `123456`)
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
