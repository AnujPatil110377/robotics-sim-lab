const http = require('http');
// Replace the placeholder values below with your real CRD credentials before running.
// Do NOT commit real credentials to source control.
const body = JSON.stringify({
  // Use the lightweight load simulator image for testing
  image: 'local/load-sim:latest',
  cpu: 1,
  ramMb: 256,
  name: 'load-sim-test',
  // No CRD fields for this test image
});

const opts = {
  hostname: 'localhost',
  port: 3001,
  path: '/instances',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body)
  }
};

const req = http.request(opts, (res) => {
  let data = '';
  res.on('data', (c) => data += c);
  res.on('end', () => {
    console.log('STATUS', res.statusCode);
    console.log('BODY:\n', data);
  });
});
req.on('error', (err) => console.error('REQUEST ERROR', err));
req.write(body);
req.end();
