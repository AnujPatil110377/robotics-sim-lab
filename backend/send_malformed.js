const http = require('http');
const fs = require('fs');
const path = require('path');
const payloadPath = path.join(__dirname, 'malformed_payload.json');
const body = fs.readFileSync(payloadPath, 'utf8');

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
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log('STATUS', res.statusCode);
    console.log('BODY:\n', data);
  });
});
req.on('error', (err) => {
  console.error('REQUEST ERROR', err);
});
req.write(body);
req.end();
