const express = require('express');
const Docker = require('dockerode');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());

const dockerCandidates = () => {
  const candidates = [];
  if (process.env.DOCKER_HOST) {
    candidates.push({ type: 'env', config: {} });
  }

  if (process.platform === 'win32') {
    const pipes = ['dockerDesktopLinuxEngine', 'dockerDesktopEngine', 'docker_engine'];
    for (const pipe of pipes) {
      candidates.push({ type: 'npipe', config: { socketPath: `//./pipe/${pipe}` } });
    }
  }

  candidates.push({ type: 'unix', config: { socketPath: '/var/run/docker.sock' } });
  return candidates;
};

let docker;

async function connectDocker() {
  const candidates = dockerCandidates();
  for (const candidate of candidates) {
    try {
      const client = candidate.type === 'env' ? new Docker() : new Docker(candidate.config);
      await client.ping();
      console.log(`Connected to Docker via ${candidate.type === 'env' ? process.env.DOCKER_HOST : candidate.config.socketPath}`);
      return client;
    } catch (err) {
      if (candidate === candidates[candidates.length - 1]) {
        throw err;
      }
    }
  }
  throw new Error('Unable to connect to Docker daemon');
}

const APP_LABEL = 'rdp-provisioner';
const INSTANCE_LABEL_KEY = 'rdp.instanceId';
const USE_TRAEFIK = process.env.USE_TRAEFIK === '1';

function toNanoCPUs(cpus) {
  return Math.max(1, Math.floor((Number(cpus) || 1) * 1e9));
}

function toBytes(mb) {
  return Math.max(64, Math.floor(Number(mb) || 512)) * 1024 * 1024;
}

function pullImageIfNeeded(image) {
  return new Promise((resolve, reject) => {
    docker.pull(image, (err, stream) => {
      if (err) return reject(err);
      docker.modem.followProgress(stream, (pullErr) => {
        if (pullErr) return reject(pullErr);
        resolve();
      });
    });
  });
}

async function findContainerByInstanceId(id) {
  const list = await docker.listContainers({
    all: true,
    filters: {
      label: [`app=${APP_LABEL}`, `${INSTANCE_LABEL_KEY}=${id}`],
    },
  });
  if (!list.length) return null;
  return docker.getContainer(list[0].Id);
}

app.post('/instances', async (req, res) => {
  try {
    const {
      image = 'accetto/ubuntu-vnc-xfce',
      internalPort = 6901,
      cpu = 1,
      ramMb = 1024,
      name,
      crd,
    } = req.body || {};

    if (!image) return res.status(400).json({ error: 'image is required' });
    const usingCRD = Boolean(crd?.code && crd?.email);

    if (!internalPort && !usingCRD) {
      return res.status(400).json({ error: 'internalPort is required unless using Chrome Remote Desktop' });
    }

    const instanceId = uuidv4().slice(0, 8);
    const containerName = (name || `desk-${instanceId}`)
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '');

  const exposed = usingCRD ? null : { [`${internalPort}/tcp`]: {} };

    const env = [
      `INSTANCE_ID=${instanceId}`,
      crd?.email ? `CRD_EMAIL=${crd.email}` : null,
      crd?.code ? `CRD_CODE=${crd.code}` : null,
      `CRD_HOSTNAME=${name || `desk-${instanceId}`}`,
    ].filter(Boolean);

    const labels = {
      app: APP_LABEL,
      [INSTANCE_LABEL_KEY]: instanceId,
      'rdp.name': containerName,
      'rdp.internalPort': String(internalPort),
    };

    if (USE_TRAEFIK) {
      labels['traefik.enable'] = 'true';
      labels[`traefik.http.routers.${containerName}.entrypoints`] = 'web';
      labels[`traefik.http.routers.${containerName}.rule`] = `PathPrefix(\`/i/${instanceId}\`)`;
      labels[`traefik.http.services.${containerName}.loadbalancer.server.port`] = String(internalPort);
      labels[`traefik.http.middlewares.${containerName}-strip.stripprefix.prefixes`] = `/i/${instanceId}`;
      labels[`traefik.http.routers.${containerName}.middlewares`] = `${containerName}-strip`;
    }

    if (crd?.email) {
      labels['rdp.crdEmail'] = crd.email;
    }
    if (crd?.code) {
      labels['rdp.crdConfigured'] = 'true';
    }

    const containerConfig = {
      Image: image,
      name: containerName,
      Env: env,
      HostConfig: {
        PublishAllPorts: usingCRD ? false : !USE_TRAEFIK,
        Memory: toBytes(ramMb),
        NanoCpus: toNanoCPUs(cpu),
        RestartPolicy: { Name: 'unless-stopped' },
      },
      Labels: labels,
    };

    if (!usingCRD && exposed) {
      containerConfig.ExposedPorts = exposed;
    }

    let container;
    try {
      container = await docker.createContainer(containerConfig);
    } catch (err) {
      if (err?.statusCode === 404 && /No such image/i.test(err?.json?.message || '')) {
        await pullImageIfNeeded(image);
        container = await docker.createContainer(containerConfig);
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
      url = `http://localhost/i/${instanceId}`;
    } else {
      const portInfo = info.NetworkSettings.Ports[`${internalPort}/tcp`];
      const hostPort = portInfo && portInfo[0] ? portInfo[0].HostPort : null;
      url = hostPort ? `http://localhost:${hostPort}` : null;
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
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed to create instance', details: String(err) });
  }
});

app.get('/instances', async (_req, res) => {
  try {
    const list = await docker.listContainers({
      all: true,
      filters: { label: [`app=${APP_LABEL}`] },
    });
    const instances = list.map((c) => {
      const labels = c.Labels || {};
      const internalPort = labels['rdp.internalPort'] || '6080';
      const ports = c.Ports || [];
      const mapped = ports.find(
        (p) => String(p.PrivatePort) === String(internalPort) && p.Type === 'tcp',
      );
      const crdEmail = labels['rdp.crdEmail'];
      const usingCRD = Boolean(crdEmail || labels['rdp.crdConfigured']);
      let url = null;

      if (usingCRD) {
        url = null;
      } else if (USE_TRAEFIK) {
        url = `http://localhost/i/${labels[INSTANCE_LABEL_KEY]}`;
      } else {
        url = mapped ? `http://localhost:${mapped.PublicPort}` : null;
      }
      return {
        id: labels[INSTANCE_LABEL_KEY],
  name: labels['rdp.name'] || c.Names?.[0]?.replace(/^\//, ''),
        image: c.Image,
        state: c.State,
        status: c.Status,
        cpu: undefined,
        ramMb: undefined,
        internalPort: Number(internalPort),
        url,
        crdAccessUrl: usingCRD ? 'https://remotedesktop.google.com/access' : null,
        crdEmail: crdEmail || null,
        containerId: c.Id.substring(0, 12),
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
    res.json({ ok: true });
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
