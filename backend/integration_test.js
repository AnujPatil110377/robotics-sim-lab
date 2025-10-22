const http = require('http');

const HOST = 'localhost';
const PORT = 3001;

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const b = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: HOST,
      port: PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': b ? Buffer.byteLength(b) : 0,
      },
      timeout: 15000,
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        const ct = res.headers['content-type'] || '';
        if (ct.includes('application/json')) {
          try { return resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch (e) { return resolve({ status: res.statusCode, body: data }); }
        }
        return resolve({ status: res.statusCode, body: data });
      });
    });
    req.on('error', (err) => reject(err));
    req.on('timeout', () => { req.destroy(new Error('request timeout')); });
    if (b) req.write(b);
    req.end();
  });
}

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function main() {
  console.log('integration_test: creating test instance...');
  try {
    const payload = { image: 'local/load-sim:latest', cpu: 0.5, ramMb: 128, name: `itest-${Date.now()}` };
    const create = await request('POST', '/instances', payload);
    if (create.status !== 200) {
      console.error('failed to create instance', create.status, create.body);
      process.exit(2);
    }
    const inst = create.body;
    console.log('created instance:', inst.id, 'containerId:', inst.containerId);

    // Poll stats a few times with retries if 404
    const samples = [];
    const maxSamples = 5;
    const pollInterval = 1000;
    const maxWaitForFirst = 30000; // ms
    let waited = 0;
    for (let i = 0; i < maxSamples; i++) {
      let res;
      try {
        res = await request('GET', `/instances/${inst.id}/stats`);
      } catch (e) {
        console.warn('request error on stats:', e && e.message ? e.message : e);
        res = null;
      }

      if (!res || res.status === 404) {
        // If first sample and 404, wait and retry until timeout
        if (i === 0) {
          const start = Date.now();
          while ((Date.now() - start) < maxWaitForFirst) {
            await sleep(1000);
            try { res = await request('GET', `/instances/${inst.id}/stats`); } catch (e) { res = null; }
            if (res && res.status === 200) break;
            console.log('waiting for stats to become available...');
          }
        }
      }

      if (res && res.status === 200) {
        console.log('stats sample', i + 1, res.body);
        samples.push(res.body);
      } else {
        console.warn('stats not available (status/res):', res && res.status, res && res.body);
      }

      await sleep(pollInterval);
    }

    console.log('collected', samples.length, 'samples');

    console.log('deleting instance', inst.id);
    const del = await request('DELETE', `/instances/${inst.id}`);
    if (del.status === 200) console.log('deleted OK'); else console.warn('delete returned', del.status, del.body);

    console.log('integration_test: done');
    process.exit(0);
  } catch (err) {
    console.error('integration_test error', err && err.message ? err.message : err);
    process.exit(1);
  }
}

main();
