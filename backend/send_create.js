const http = require('http');
// Replace the placeholder values below with your real CRD credentials before running.
// Do NOT commit real credentials to source control.
const body = JSON.stringify({
  image: 'ros2-crd:humble-gpu',
  internalPort: 6901,
  cpu: 2,
  ramMb: 4096,
  name: 'ros2-crd-test',
  // If you provide crd.email and crd.code (auth code from remotedesktop.google.com/headless)
  // the backend will exec into the running container to set the PIN and run registration.
  crd: {
    email: 'b22ee010@iitj.ac.in',
      // NOTE: do NOT wrap the auth code in extra quotes here — the auth code
      // should be the literal string you copy from remotedesktop.google.com/headless
      code: '4/0AVGzR1CdW57Vt5FhVJIjMNbAY0yDyI7K0obVYbrQxLFpXxf5CC0yqvH85AkWvQgGwdf_9A',
    // numeric PIN, at least 6 digits
    password: '123456'
  }
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
