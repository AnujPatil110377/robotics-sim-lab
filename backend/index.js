// index.js
const express = require('express');
const Docker = require('dockerode');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const path = require('path');
const { PassThrough } = require('stream');

const app = express();
app.use(express.json());
app.use(cors());
app.set('trust proxy', 1); // trust Traefik proxy (Codespaces/GitHub)

/* ------------------------------------------------------------------ */
/* Docker connection                                                   */
/* ------------------------------------------------------------------ */
const dockerCandidates = () => {
  const candidates = [];
  if (process.env.DOCKER_HOST) candidates.push({ type: 'env', config: {} });
  if (process.platform === 'win32') {
    for (const pipe of ['dockerDesktopLinuxEngine', 'dockerDesktopEngine', 'docker_engine']) {
      candidates.push({ type: 'npipe', config: { socketPath: `//./pipe/${pipe}` } });
    }
  }
  candidates.push({ type: 'unix', config: { socketPath: '/var/run/docker.sock' } });
  return candidates;
};

let docker;
async function connectDocker() {
  for (const c of dockerCandidates()) {
    try {
      const client = c.type === 'env' ? new Docker() : new Docker(c.config);
      await client.ping();
      console.log(
        `Connected to Docker via ${c.type === 'env' ? process.env.DOCKER_HOST : c.config.socketPath}`
      );
      return client;
    } catch {}
  }
  throw new Error('Unable to connect to Docker daemon');
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */
const APP_LABEL = 'rdp-provisioner';
const INSTANCE_LABEL_KEY = 'rdp.instanceId';
const USE_TRAEFIK = process.env.USE_TRAEFIK === '1';

function toNanoCPUs(cpus) { return Math.max(1, Math.floor((Number(cpus) || 1) * 1e9)); }
function toBytes(mb) { return Math.max(64, Math.floor(Number(mb) || 512)) * 1024 * 1024; }

function pullImageIfNeeded(image) {
  return new Promise((resolve, reject) => {
    docker.pull(image, (err, stream) => {
      if (err) return reject(err);
      docker.modem.followProgress(stream, (pullErr) =>
        pullErr ? reject(pullErr) : resolve()
      );
    });
  });
}

async function findContainerByInstanceId(id) {
  const list = await docker.listContainers({
    all: true,
    filters: { label: [`app=${APP_LABEL}`, `${INSTANCE_LABEL_KEY}=${id}`] }
  });
  if (!list.length) return null;
  return docker.getContainer(list[0].Id);
}

async function runExecCmd(container, cmdArray) {
  const execInstance = await container.exec({
    Cmd: cmdArray,
    AttachStdout: true,
    AttachStderr: true
  });
  return new Promise((resolve, reject) => {
    execInstance.start((err, stream) => {
      if (err) return reject(err);
      const out = new PassThrough();
      const errOut = new PassThrough();
      let stdout = '';
      let stderr = '';
      out.on('data', (c) => { stdout += c.toString(); });
      errOut.on('data', (c) => { stderr += c.toString(); });
      container.modem.demuxStream(stream, out, errOut);
      stream.on('end', async () => {
        try {
          const info = await execInstance.inspect();
          resolve({ stdout, stderr, exitCode: info.ExitCode });
        } catch {
          resolve({ stdout, stderr, exitCode: null });
        }
      });
    });
  });
}

/* ------------------------------------------------------------------ */
/* Name hardening (prevents invalid names like "3")                    */
/* ------------------------------------------------------------------ */
function makeSafeName(input, fallbackId) {
  // allow a–z, 0–9, dot, underscore, dash
  const base = String(input || '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '');

  // must start with [a-z0-9] and contain at least one alnum overall
  const okStart = /^[a-z0-9]/.test(base);
  const hasAlnum = /[a-z0-9]/.test(base);

  // avoid too-short or purely numeric names; prefix for safety
  if (!base || !okStart || !hasAlnum || /^[0-9]+$/.test(base)) {
    return `desk-${fallbackId}`;
  }
  return base;
}

/* ------------------------------------------------------------------ */
/* API                                                                */
/* ------------------------------------------------------------------ */
app.post('/instances', async (req, res) => {
  try {
    const {
      image = 'accetto/ubuntu-vnc-xfce',
      internalPort = 6901,
      cpu = 1,
      ramMb = 1024,
      name,
      crd
    } = req.body || {};

    let imgName = typeof image === 'string' ? image.trim() : '' + (image || '');
    if (!imgName || /\s/.test(imgName) || /["'<>]/.test(imgName) || /[:]{2,}/.test(imgName)) {
      return res.status(400).json({ error: 'invalid image name', image: imgName });
    }

    const usingCRD = Boolean(crd?.code && crd?.email);
    if (!internalPort && !usingCRD) {
      return res.status(400).json({ error: 'internalPort is required unless using Chrome Remote Desktop' });
    }

    const instanceId = uuidv4().slice(0, 8);
    const containerName = makeSafeName(name, instanceId);

    // ⬇️ Env with safe defaults for VNC-based images
    const env = [
      `INSTANCE_ID=${instanceId}`,
      crd?.email ? `CRD_EMAIL=${crd.email}` : null,
      `CRD_HOSTNAME=${name || `desk-${instanceId}`}`,
      /vnc/i.test(image) ? `VNC_PW=${process.env.DEFAULT_VNC_PW || 'rdp123'}` : null,
      /vnc/i.test(image) ? `VNC_RESOLUTION=${process.env.DEFAULT_VNC_RES || '1360x768'}` : null,
    ].filter(Boolean);

    const exposed = usingCRD ? null : { [`${internalPort}/tcp`]: {} };

    const labels = {
      app: APP_LABEL,
      [INSTANCE_LABEL_KEY]: instanceId,
      'rdp.name': containerName
    };
    if (!usingCRD && internalPort) labels['rdp.internalPort'] = String(internalPort);
    if (usingCRD) {
      if (crd?.email) labels['rdp.crdEmail'] = crd.email;
      labels['rdp.crdConfigured'] = '1';
    }

    if (USE_TRAEFIK && !usingCRD) {
      labels['traefik.enable'] = 'true';
      labels[`traefik.http.routers.${containerName}.entrypoints`] = 'web';
      labels[`traefik.http.routers.${containerName}.rule`] = `PathPrefix(\`/i/${instanceId}\`)`;
      labels[`traefik.http.services.${containerName}.loadbalancer.server.port`] = String(internalPort);
      labels[`traefik.http.middlewares.${containerName}-strip.stripprefix.prefixes`] = `/i/${instanceId}`;
      labels[`traefik.http.routers.${containerName}.middlewares`] = `${containerName}-strip`;
      labels[`traefik.http.routers.${containerName}.priority`] = '100';
    }

    const netName = process.env.DOCKER_NETWORK;
    if (netName) labels['traefik.docker.network'] = netName;

    const containerConfig = {
      Image: image,
      name: containerName,
      Env: env,
      HostConfig: {
        PublishAllPorts: usingCRD ? false : !USE_TRAEFIK,
        Memory: toBytes(ramMb),
        NanoCpus: toNanoCPUs(cpu),
        RestartPolicy: { Name: 'unless-stopped' }
      },
      Labels: labels
    };
    if (netName) {
      containerConfig.HostConfig.NetworkMode = netName;
      containerConfig.NetworkingConfig = { EndpointsConfig: { [netName]: {} } };
    }
    if (!usingCRD && exposed) containerConfig.ExposedPorts = exposed;

    let container;
    try {
      container = await docker.createContainer(containerConfig);
    } catch (err) {
      const msg = err?.json?.message || err?.message || String(err);
      if (err?.statusCode === 404 && /No such image/i.test(msg)) {
        await pullImageIfNeeded(image);
        container = await docker.createContainer(containerConfig);
      } else if (err?.statusCode === 400 && /invalid reference format/i.test(msg)) {
        return res.status(400).json({ error: 'invalid image reference format', image, details: msg });
      } else {
        throw err;
      }
    }

    await container.start();

    const info = await container.inspect();
    let url = null;
    if (usingCRD) {
      url = null;
    } else if (USE_TRAEFIK) {
      // Route through Traefik. The UI deep-links to /vnc*.html with ?path=/i/<id>/websockify
      url = `/i/${instanceId}`;
    } else {
      const portInfo = info.NetworkSettings.Ports[`${internalPort}/tcp`];
      const hostPort = portInfo && portInfo[0] ? portInfo[0].HostPort : null;
      url = hostPort ? `/i/${hostPort}` : null;
    }

    return res.json({
      id: instanceId,
      name: containerName,
      image,
      cpu,
      ramMb,
      internalPort,
      url,
      crdAccessUrl: usingCRD ? 'https://remotedesktop.google.com/access' : null,
      crdEmail: usingCRD ? crd.email : null,
      containerId: info.Id.substring(0, 12),
      state: info.State.Status,
      crdRegistration: req.crdRegistration || null
    });
  } catch (err) {
    console.error(err);
    const msg = err?.json?.message || err?.message || String(err);
    if (/invalid reference format/i.test(msg) || /bad parameter - invalid reference format/i.test(msg)) {
      return res.status(400).json({ error: 'invalid image reference format', image: req.body?.image, details: msg });
    }
    res.status(500).json({ error: 'failed to create instance', details: String(err) });
  }
});

app.get('/instances', async (_req, res) => {
  try {
    const list = await docker.listContainers({ all: true, filters: { label: [`app=${APP_LABEL}`] } });
    const instances = list.map((c) => {
      const labels = c.Labels || {};
      const internalPortLabel = labels['rdp.internalPort'];
      const ports = c.Ports || [];
      const mapped = internalPortLabel
        ? ports.find((p) => String(p.PrivatePort) === String(internalPortLabel) && p.Type === 'tcp')
        : null;

      const crdEmail = labels['rdp.crdEmail'];
      const usingCRD = Boolean(crdEmail || labels['rdp.crdConfigured']);

      let url = null;
      if (!usingCRD) {
        if (USE_TRAEFIK) url = `/i/${labels[INSTANCE_LABEL_KEY]}`;
        else url = mapped ? `/i/${mapped.PublicPort}` : null;
      }

      return {
        id: labels[INSTANCE_LABEL_KEY],
        name: labels['rdp.name'] || c.Names?.[0]?.replace(/^\//, ''),
        image: c.Image,
        state: c.State,
        status: c.Status,
        cpu: undefined,
        ramMb: undefined,
        internalPort: internalPortLabel ? Number(internalPortLabel) : null,
        url,
        crdAccessUrl: usingCRD ? 'https://remotedesktop.google.com/access' : null,
        crdEmail: crdEmail || null,
        containerId: c.Id.substring(0, 12)
      };
    });

    res.json(instances);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to list instances', details: String(err) });
  }
});

app.delete('/instances/:id', async (req, res) => {
  try {
    const container = await findContainerByInstanceId(req.params.id);
    if (!container) return res.status(404).json({ error: 'not found' });
    await container.stop().catch(() => {});
    await container.remove({ force: true });
    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to delete instance', details: String(err) });
  }
});

app.post('/instances/:id/:action', async (req, res) => {
  try {
    const container = await findContainerByInstanceId(req.params.id);
    if (!container) return res.status(404).json({ error: 'not found' });

    const { action } = req.params;
    if (!['start', 'stop', 'restart'].includes(action)) {
      return res.status(400).json({ error: 'invalid action' });
    }

    if (action === 'start') await container.start();
    if (action === 'stop') await container.stop();
    if (action === 'restart') await container.restart();

    const info = await container.inspect();
    res.json({ ok: true, state: info.State.Status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to perform action', details: String(err) });
  }
});

/* ------------------------------------------------------------------ */
/* Static portal                                                       */
/* ------------------------------------------------------------------ */
app.use(express.static(path.join(__dirname, 'public')));

async function start() {
  try {
    docker = await connectDocker();
  } catch (err) {
    console.error('Failed to connect to Docker daemon. Is Docker running?', err);
    process.exit(1);
  }
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`API on http://localhost:${PORT}`);
  });
}

start();
