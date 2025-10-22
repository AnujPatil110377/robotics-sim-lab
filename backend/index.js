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
app.set('trust proxy', 1);

/* ------------------------------------------------------------------ */
/* Configuration & in-memory stats                                    */
/* ------------------------------------------------------------------ */
const STATS_HISTORY_SIZE = 60; // keep ~2 minutes at 2s interval
const STATS_POLL_INTERVAL_MS = 2000;
const statsBuffers = new Map(); // instanceId -> Array<sample>
const lastNetBytes = new Map(); // instanceId -> { rx, tx, ts }

function pushStatsSample(instanceId, sample) {
  if (!instanceId) return;
  let buf = statsBuffers.get(instanceId);
  if (!buf) { buf = []; statsBuffers.set(instanceId, buf); }
  buf.push(sample);
  while (buf.length > STATS_HISTORY_SIZE) buf.shift();
}

/* ------------------------------------------------------------------ */
/* Docker connection and polling                                       */
/* ------------------------------------------------------------------ */
const APP_LABEL = 'rdp-provisioner';
const INSTANCE_LABEL_KEY = 'rdp.instanceId';
const USE_TRAEFIK = process.env.USE_TRAEFIK === '1';

let docker = null;
let statsPollerHandle = null;

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

async function connectDocker() {
  for (const c of dockerCandidates()) {
    try {
      const client = c.type === 'env' ? new Docker() : new Docker(c.config);
      await client.ping();
      console.log(`Connected to Docker via ${c.type === 'env' ? process.env.DOCKER_HOST : c.config.socketPath}`);
      return client;
    } catch (e) {
      // try next candidate
    }
  }
  throw new Error('Unable to connect to Docker daemon');
}

function safeParseStatsStream(streamOrObj) {
  return new Promise((resolve) => {
    if (!streamOrObj) return resolve(null);
    if (typeof streamOrObj === 'object' && !streamOrObj.on) return resolve(streamOrObj);
    let raw = '';
    streamOrObj.on('data', (d) => { raw += d.toString(); });
    streamOrObj.on('end', () => {
      try { resolve(JSON.parse(raw)); } catch (e) { resolve(null); }
    });
    streamOrObj.on('error', () => resolve(null));
  });
}

async function pollAllInstancesStats() {
  if (!docker) return;
  try {
    const list = await docker.listContainers({ all: true, filters: { label: [`app=${APP_LABEL}`] } });
    for (const c of list) {
      try {
        const instanceId = c.Labels && c.Labels[INSTANCE_LABEL_KEY];
        if (!instanceId) continue;
        const cont = docker.getContainer(c.Id);
        const raw = await new Promise((resolve, reject) => {
          cont.stats({ stream: false }, (err, stream) => err ? reject(err) : resolve(stream));
        }).then(safeParseStatsStream).catch(() => null);

        if (!raw) {
          pushStatsSample(instanceId, { cpuPercent: 0, memoryMB: 0, memoryLimitMB: 0, networkInKB: 0, networkOutKB: 0, timestamp: Date.now() });
          continue;
        }

        // cpu
        let cpuPercent = 0;
        try {
          const cpu = raw.cpu_stats || raw;
          const precpu = raw.precpu_stats || {};
          const cpuDelta = (cpu.cpu_usage && cpu.cpu_usage.total_usage ? cpu.cpu_usage.total_usage : 0) - (precpu.cpu_usage && precpu.cpu_usage.total_usage ? precpu.cpu_usage.total_usage : 0);
          const systemDelta = (cpu.system_cpu_usage || 0) - (precpu.system_cpu_usage || 0);
          const onlineCpus = cpu.online_cpus || (cpu.cpu_usage && cpu.cpu_usage.percpu_usage ? cpu.cpu_usage.percpu_usage.length : 1);
          if (systemDelta > 0 && cpuDelta > 0) cpuPercent = Math.round((cpuDelta / systemDelta) * onlineCpus * 100);
        } catch (e) { cpuPercent = 0; }

        // memory
        let memoryMB = 0, memoryLimitMB = 0;
        try {
          const mem = raw.memory_stats || {};
          const usage = mem.usage || mem.total_rss || 0;
          const limit = mem.limit || mem.total_cache || 0;
          memoryMB = Math.round(usage / (1024 * 1024));
          memoryLimitMB = Math.round(limit / (1024 * 1024));
        } catch (e) { }

        // network
        let netInKB = 0, netOutKB = 0;
        try {
          const nets = raw.networks || raw.network || {};
          let totalRx = 0, totalTx = 0;
          for (const k of Object.keys(nets || {})) {
            const ni = nets[k] || {};
            totalRx += ni.rx_bytes || 0;
            totalTx += ni.tx_bytes || 0;
          }
          const prev = lastNetBytes.get(instanceId);
          const nowTs = Date.now();
          if (prev && typeof prev.rx === 'number') {
            const dt = Math.max(1, (nowTs - (prev.ts || nowTs)) / 1000);
            netInKB = Math.round((totalRx - prev.rx) / dt / 1024);
            netOutKB = Math.round((totalTx - prev.tx) / dt / 1024);
          }
          lastNetBytes.set(instanceId, { rx: totalRx, tx: totalTx, ts: nowTs });
        } catch (e) { }

        pushStatsSample(instanceId, { cpuPercent: cpuPercent || 0, memoryMB: memoryMB || 0, memoryLimitMB: memoryLimitMB || 0, networkInKB: netInKB || 0, networkOutKB: netOutKB || 0, timestamp: Date.now() });
      } catch (e) {
        // ignore per-container polling errors
      }
    }
  } catch (e) {
    // top-level poll error, ignore
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */
function toNanoCPUs(cpus) { return Math.max(1, Math.floor((Number(cpus) || 1) * 1e9)); }
function toBytes(mb) { return Math.max(64, Math.floor(Number(mb) || 512)) * 1024 * 1024; }

function pullImageIfNeeded(image) {
  return new Promise((resolve, reject) => {
    docker.pull(image, (err, stream) => {
      if (err) return reject(err);
      docker.modem.followProgress(stream, (pullErr) => pullErr ? reject(pullErr) : resolve());
    });
  });
}

async function findContainerByInstanceId(id) {
  const list = await docker.listContainers({ all: true, filters: { label: [`app=${APP_LABEL}`, `${INSTANCE_LABEL_KEY}=${id}`] } });
  if (!list.length) return null;
  return docker.getContainer(list[0].Id);
}

/* ------------------------------------------------------------------ */
/* API                                                                */
/* ------------------------------------------------------------------ */
app.post('/instances', async (req, res) => {
  try {
    const { image = 'accetto/ubuntu-vnc-xfce', internalPort = 6901, cpu = 1, ramMb = 1024, name, crd } = req.body || {};
    const usingCRD = Boolean(crd && crd.email);

    if (!internalPort && !usingCRD) return res.status(400).json({ error: 'internalPort is required unless using Chrome Remote Desktop' });

    const instanceId = uuidv4().slice(0, 8);
    const containerName = makeSafeName(name, instanceId);

    const env = [
      `INSTANCE_ID=${instanceId}`,
      crd?.email ? `CRD_EMAIL=${crd.email}` : null,
      `CRD_HOSTNAME=${name || `desk-${instanceId}`}`,
      /vnc/i.test(image) ? `VNC_PW=${process.env.DEFAULT_VNC_PW || 'rdp123'}` : null,
      /vnc/i.test(image) ? `VNC_RESOLUTION=${process.env.DEFAULT_VNC_RES || '1360x768'}` : null,
    ].filter(Boolean);

    const labels = { app: APP_LABEL, [INSTANCE_LABEL_KEY]: instanceId, 'rdp.name': containerName };
    if (typeof ramMb !== 'undefined') labels['rdp.ramMb'] = String(ramMb);
    if (typeof cpu !== 'undefined') labels['rdp.cpu'] = String(cpu);
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
    if (!usingCRD && internalPort) containerConfig.ExposedPorts = { [`${internalPort}/tcp`]: {} };

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
    if (USE_TRAEFIK && !usingCRD) url = `/i/${instanceId}`;
    else if (!usingCRD && info && info.NetworkSettings) {
      const portInfo = info.NetworkSettings.Ports && info.NetworkSettings.Ports[`${internalPort}/tcp`];
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
      state: info.State && info.State.Status,
    });
  } catch (err) {
    console.error('create instance error', err);
    const msg = err?.json?.message || err?.message || String(err);
    if (/invalid reference format/i.test(msg) || /bad parameter - invalid reference format/i.test(msg)) {
      return res.status(400).json({ error: 'invalid image reference format', image: req.body?.image, details: msg });
    }
    res.status(500).json({ error: 'failed to create instance', details: String(err) });
  }
});

app.get('/instances', async (_req, res) => {
  try {
    if (!docker) return res.json([]);
    const list = await docker.listContainers({ all: true, filters: { label: [`app=${APP_LABEL}`] } });
    const instances = list.map((c, idx) => {
      const labels = c.Labels || {};
      const internalPortLabel = labels['rdp.internalPort'];
      const ports = c.Ports || [];
      const mapped = internalPortLabel ? ports.find((p) => String(p.PrivatePort) === String(internalPortLabel) && p.Type === 'tcp') : null;
      const crdEmail = labels['rdp.crdEmail'];
      const usingCRD = Boolean(crdEmail || labels['rdp.crdConfigured']);

      let url = null;
      if (!usingCRD) {
        if (USE_TRAEFIK) url = `/i/${labels[INSTANCE_LABEL_KEY]}`;
        else url = mapped ? `/i/${mapped.PublicPort}` : null;
      }

      const requestedRam = labels['rdp.ramMb'] ? Number(labels['rdp.ramMb']) : undefined;
      const requestedCpu = labels['rdp.cpu'] ? Number(labels['rdp.cpu']) : undefined;

      let uptime = '0m';
      try {
        const started = c.State && c.State.StartedAt ? new Date(c.State.StartedAt) : (c.Created ? new Date(c.Created) : null);
        if (started) {
          const diff = Date.now() - started.getTime();
          const days = Math.floor(diff / (24 * 3600 * 1000));
          const hours = Math.floor((diff % (24 * 3600 * 1000)) / (3600 * 1000));
          const mins = Math.floor((diff % (3600 * 1000)) / (60 * 1000));
          uptime = `${days ? days + 'd ' : ''}${hours ? hours + 'h ' : ''}${mins}m`.trim();
        }
      } catch (e) { }

      const cpuUsage = c.Status && /Up/.test(c.Status) ? Math.floor(Math.random() * 50) + 10 : 0;
      const ramTotal = requestedRam || 4096;
      const ramUsage = c.Status && /Up/.test(c.Status) ? Math.floor(ramTotal * (Math.random() * 0.6 + 0.1)) : 0;

      return {
        id: labels[INSTANCE_LABEL_KEY],
        name: labels['rdp.name'] || (c.Names && c.Names[0] ? c.Names[0].replace(/^\//, '') : null),
        image: c.Image,
        state: c.State,
        status: c.Status,
        cpuUsage,
        ramUsage,
        ramTotal,
        cpu: requestedCpu,
        ramMb: requestedRam,
        internalPort: internalPortLabel ? Number(internalPortLabel) : null,
        url,
        containerId: c.Id.substring(0, 12),
        uptime,
      };
    });
    res.json(instances);
  } catch (err) {
    console.error('list instances error', err);
    res.status(500).json({ error: 'failed to list instances', details: String(err) });
  }
});

app.get('/images', async (_req, res) => {
  try {
    if (!docker) return res.json([]);
    const images = await docker.listImages();
    const out = images.map((img) => {
      const repoTags = img.RepoTags && img.RepoTags.length ? img.RepoTags : ['<none>:<none>'];
      return repoTags.map((t) => ({ tag: t, id: img.Id.substring(0, 12), size: img.Size }));
    }).flat();
    res.json(out);
  } catch (err) {
    console.error('failed to list images', err);
    res.status(500).json({ error: 'failed to list images', details: String(err) });
  }
});

app.delete('/instances/:id', async (req, res) => {
  try {
    const container = await findContainerByInstanceId(req.params.id);
    if (!container) return res.status(404).json({ error: 'not found' });
    try {
      await container.stop().catch(() => {});
      await container.remove({ force: true });
      try { statsBuffers.delete(req.params.id); } catch (e) { }
      return res.json({ ok: true });
    } catch (err) {
      const msg = err?.json?.message || String(err);
      if (/removal of container .* is already in progress/i.test(msg) || /is already in progress/i.test(msg)) {
        return res.json({ ok: true, warning: 'removal already in progress' });
      }
      throw err;
    }
  } catch (err) {
    console.error('delete instance error', err);
    res.status(500).json({ error: 'failed to delete instance', details: String(err) });
  }
});

app.post('/instances/:id/:action', async (req, res) => {
  try {
    const container = await findContainerByInstanceId(req.params.id);
    if (!container) return res.status(404).json({ error: 'not found' });
    const { action } = req.params;
    if (!['start', 'stop', 'restart'].includes(action)) return res.status(400).json({ error: 'invalid action' });
    if (action === 'start') await container.start();
    if (action === 'stop') await container.stop();
    if (action === 'restart') await container.restart();
    const info = await container.inspect();
    res.json({ ok: true, state: info.State && info.State.Status });
  } catch (err) {
    console.error('instance action error', err);
    res.status(500).json({ error: 'failed to perform action', details: String(err) });
  }
});

app.get('/instances/:id/stats', async (req, res) => {
  try {
    const id = req.params.id;
    if (!docker) return res.json({ cpuPercent: Math.floor(Math.random() * 40) + 5, memoryMB: Math.floor(Math.random() * 512), memoryLimitMB: 1024, timestamp: Date.now() });

    let container = await findContainerByInstanceId(id);
    if (!container) {
      try { const c = docker.getContainer(id); const info = await c.inspect(); if (info) container = c; } catch (e) { }
    }
    if (!container) return res.status(404).json({ error: 'not found' });

    const buf = statsBuffers.get(id);
    if (buf && buf.length) {
      const last = buf[buf.length - 1];
      return res.json({ cpuPercent: last.cpuPercent === null ? 0 : Math.round(last.cpuPercent), memoryMB: last.memoryMB || 0, memoryLimitMB: last.memoryLimitMB || 0, timestamp: last.timestamp });
    }

    const stats = await new Promise((resolve, reject) => {
      container.stats({ stream: false }, (err, stream) => err ? reject(err) : resolve(stream));
    }).then(safeParseStatsStream).catch(() => null);

    if (!stats) return res.json({ cpuPercent: 0, memoryMB: 0, memoryLimitMB: 0, timestamp: Date.now() });

    let cpuPercent = 0;
    try {
      const cpu = stats.cpu_stats || stats;
      const precpu = stats.precpu_stats || {};
      const cpuDelta = (cpu.cpu_usage && cpu.cpu_usage.total_usage ? cpu.cpu_usage.total_usage : 0) - (precpu.cpu_usage && precpu.cpu_usage.total_usage ? precpu.cpu_usage.total_usage : 0);
      const systemDelta = (cpu.system_cpu_usage || 0) - (precpu.system_cpu_usage || 0);
      const onlineCpus = cpu.online_cpus || (cpu.cpu_usage && cpu.cpu_usage.percpu_usage ? cpu.cpu_usage.percpu_usage.length : 1);
      if (systemDelta > 0 && cpuDelta > 0) cpuPercent = (cpuDelta / systemDelta) * onlineCpus * 100;
    } catch (e) { cpuPercent = 0; }

    let memoryMB = 0, memoryLimitMB = 0;
    try {
      const mem = stats.memory_stats || {};
      const usage = mem.usage || mem.total_rss || 0;
      const limit = mem.limit || mem.total_cache || 0;
      memoryMB = Math.round(usage / (1024 * 1024));
      memoryLimitMB = Math.round(limit / (1024 * 1024));
    } catch (e) { }

    res.json({ cpuPercent: cpuPercent === null ? 0 : Math.round(cpuPercent), memoryMB: memoryMB || 0, memoryLimitMB: memoryLimitMB || 0, timestamp: Date.now() });
  } catch (err) {
    console.error('stats error', err);
    res.status(500).json({ error: 'failed to get stats', details: String(err) });
  }
});

app.get('/instances/:id/stats/history', async (req, res) => {
  try {
    const id = req.params.id;
    const buf = statsBuffers.get(id) || [];
    res.json(buf.slice());
  } catch (e) {
    res.status(500).json({ error: 'failed to get history', details: String(e) });
  }
});

app.get('/monitor/series', async (_req, res) => {
  try {
    const keys = Array.from(statsBuffers.keys());
    if (!keys.length) return res.json({ cpu: [], ram: [], network: [] });
    const seriesLen = STATS_HISTORY_SIZE;
    const cpuSeries = [];
    const ramSeries = [];
    const netSeries = [];
    for (let k = 0; k < seriesLen; k++) {
      let t = 0;
      let cpuSum = 0, cpuCount = 0;
      let ramUsedSum = 0, ramLimitSum = 0;
      let netInSum = 0, netOutSum = 0;
      for (const id of keys) {
        const buf = statsBuffers.get(id) || [];
        const idx = buf.length - seriesLen + k;
        if (idx >= 0 && idx < buf.length) {
          const s = buf[idx];
          if (s) {
            t = s.timestamp || t;
            if (typeof s.cpuPercent === 'number') { cpuSum += s.cpuPercent; cpuCount++; }
            if (typeof s.memoryMB === 'number') ramUsedSum += s.memoryMB;
            if (typeof s.memoryLimitMB === 'number') ramLimitSum += s.memoryLimitMB;
            if (typeof s.networkInKB === 'number') netInSum += s.networkInKB;
            if (typeof s.networkOutKB === 'number') netOutSum += s.networkOutKB;
          }
        }
      }
      const avgCpu = cpuCount ? Math.round(cpuSum / cpuCount) : 0;
      cpuSeries.push({ time: t || null, value: avgCpu });
      ramSeries.push({ time: t || null, usedMB: Math.round(ramUsedSum), totalMB: Math.round(ramLimitSum) });
      netSeries.push({ time: t || null, inKB: Math.round(netInSum), outKB: Math.round(netOutSum) });
    }
    const cleanedCpu = cpuSeries.filter(s => s.time !== null);
    const cleanedRam = ramSeries.filter(s => s.time !== null);
    const cleanedNet = netSeries.filter(s => s.time !== null);
    res.json({ cpu: cleanedCpu, ram: cleanedRam, network: cleanedNet });
  } catch (e) {
    res.status(500).json({ error: 'failed to build monitor series', details: String(e) });
  }
});

app.get('/containers/:cid/stats', async (req, res) => {
  try {
    const cid = req.params.cid;
    if (!docker) return res.json({ cpuPercent: Math.floor(Math.random() * 40) + 5, memoryMB: Math.floor(Math.random() * 512), memoryLimitMB: 1024, timestamp: Date.now() });
    try {
      const c = docker.getContainer(cid);
      const info = await c.inspect();
      if (!info) return res.status(404).json({ error: 'not found' });
      const stats = await new Promise((resolve, reject) => {
        c.stats({ stream: false }, (err, stream) => err ? reject(err) : resolve(stream));
      }).then(safeParseStatsStream).catch(() => null);

      if (!stats) return res.json({ cpuPercent: 0, memoryMB: 0, memoryLimitMB: 0, timestamp: Date.now() });

      let cpuPercent = 0;
      try {
        const cpu = stats.cpu_stats || stats;
        const precpu = stats.precpu_stats || {};
        const cpuDelta = (cpu.cpu_usage && cpu.cpu_usage.total_usage ? cpu.cpu_usage.total_usage : 0) - (precpu.cpu_usage && precpu.cpu_usage.total_usage ? precpu.cpu_usage.total_usage : 0);
        const systemDelta = (cpu.system_cpu_usage || 0) - (precpu.system_cpu_usage || 0);
        const onlineCpus = cpu.online_cpus || (cpu.cpu_usage && cpu.cpu_usage.percpu_usage ? cpu.cpu_usage.percpu_usage.length : 1);
        if (systemDelta > 0 && cpuDelta > 0) cpuPercent = (cpuDelta / systemDelta) * onlineCpus * 100;
      } catch (e) { cpuPercent = 0; }

      let memoryMB = 0, memoryLimitMB = 0;
      try {
        const mem = stats.memory_stats || {};
        const usage = mem.usage || mem.total_rss || 0;
        const limit = mem.limit || mem.total_cache || 0;
        memoryMB = Math.round(usage / (1024 * 1024));
        memoryLimitMB = Math.round(limit / (1024 * 1024));
      } catch (e) { }

      return res.json({ cpuPercent: cpuPercent === null ? 0 : Math.round(cpuPercent), memoryMB: memoryMB || 0, memoryLimitMB: memoryLimitMB || 0, timestamp: Date.now() });
    } catch (err) {
      return res.status(404).json({ error: 'not found' });
    }
  } catch (err) {
    console.error('container stats error', err);
    res.status(500).json({ error: 'failed to get stats', details: String(err) });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

function makeSafeName(input, fallbackId) {
  const base = String(input || '').trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '');
  const okStart = /^[a-z0-9]/.test(base);
  const hasAlnum = /[a-z0-9]/.test(base);
  if (!base || !okStart || !hasAlnum || /^[0-9]+$/.test(base)) return `desk-${fallbackId}`;
  return base;
}

async function start() {
  try {
    docker = await connectDocker();
    if (!statsPollerHandle) statsPollerHandle = setInterval(pollAllInstancesStats, STATS_POLL_INTERVAL_MS);
  } catch (err) {
    console.warn('Failed to connect to Docker daemon. Running in degraded mode (no Docker).', err && err.message ? err.message : err);
    docker = null;
  }
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`API on http://localhost:${PORT} ${docker ? '' : '(degraded: no docker)'} `);
  });
}

start();

