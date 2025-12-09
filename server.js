const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const ROOT_DIR = __dirname;
const UPLOAD_DIR = path.join(ROOT_DIR, 'uploads');
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10MB

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg'
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function serveStatic(req, res, pathname) {
  const normalizedPath = path.normalize(decodeURIComponent(pathname));
  const relativePath = normalizedPath === '/' ? '/index.html' : normalizedPath;
  const safePath = path.join(ROOT_DIR, relativePath);

  if (!safePath.startsWith(ROOT_DIR)) {
    sendJson(res, 403, { error: 'Access denied' });
    return;
  }

  fs.stat(safePath, (err, stats) => {
    if (err || !stats.isFile()) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }

    const ext = path.extname(safePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });

    const stream = fs.createReadStream(safePath);
    stream.on('error', () => sendJson(res, 500, { error: 'File read error' }));
    stream.pipe(res);
  });
}

function parseMultipartBody(buffer, boundary) {
  const boundaryMarker = Buffer.from(`--${boundary}`);
  const endMarker = Buffer.from(`--${boundary}--`);
  const parts = [];

  let position = buffer.indexOf(boundaryMarker);
  while (position !== -1) {
    let headerStart = position + boundaryMarker.length;
    if (buffer[headerStart] === 13 && buffer[headerStart + 1] === 10) {
      headerStart += 2;
    }

    const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), headerStart);
    if (headerEnd === -1) break;

    const headersText = buffer.slice(headerStart, headerEnd).toString('utf8');

    let nextBoundary = buffer.indexOf(boundaryMarker, headerEnd + 4);
    let reachedEnd = false;
    if (nextBoundary === -1) {
      nextBoundary = buffer.indexOf(endMarker, headerEnd + 4);
      reachedEnd = true;
    }
    if (nextBoundary === -1) break;

    const dataEnd = nextBoundary - 2; // remove trailing CRLF
    const data = buffer.slice(headerEnd + 4, dataEnd);
    parts.push({ headers: headersText, data });

    if (reachedEnd) break;
    position = nextBoundary;
  }

  return parts;
}

function handleUpload(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=([^;]+)/i);

  if (!boundaryMatch) {
    sendJson(res, 400, { error: 'Multipart form data with a boundary is required.' });
    return;
  }

  const boundary = boundaryMatch[1];
  const chunks = [];
  let received = 0;
  let aborted = false;

  req.on('data', (chunk) => {
    if (aborted) return;
    received += chunk.length;
    if (received > MAX_UPLOAD_SIZE) {
      aborted = true;
      sendJson(res, 413, { error: 'Upload too large. Maximum size is 10MB.' });
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });

  req.on('error', () => {
    if (!aborted) sendJson(res, 500, { error: 'Failed to read upload stream.' });
  });

  req.on('end', () => {
    if (aborted) return;
    const body = Buffer.concat(chunks);
    const parts = parseMultipartBody(body, boundary);

    const imagePart = parts.find((part) => {
      const dispositionLine = part.headers
        .split(/\r?\n/)
        .find((line) => line.toLowerCase().startsWith('content-disposition'));
      if (!dispositionLine) return false;

      const nameMatch = dispositionLine.match(/name="([^"]+)"/i);
      const fieldName = nameMatch ? nameMatch[1] : '';
      if (fieldName !== 'image') return false;

      const filenameMatch = dispositionLine.match(/filename="([^"]*)"/i);
      return Boolean(filenameMatch && filenameMatch[1]);
    });

    if (!imagePart) {
      sendJson(res, 400, { error: 'No image file provided in field "image".' });
      return;
    }

    const contentTypeLine = imagePart.headers
      .split(/\r?\n/)
      .find((line) => line.toLowerCase().startsWith('content-type'));

    const mimeType = contentTypeLine
      ? contentTypeLine.split(':')[1].trim().toLowerCase()
      : 'application/octet-stream';

    if (!mimeType.startsWith('image/')) {
      sendJson(res, 400, { error: 'Only image uploads are allowed.' });
      return;
    }

    const extensionMap = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/gif': '.gif',
      'image/webp': '.webp'
    };

    const fileExtension = extensionMap[mimeType] || '.img';
    const fileName = `${randomUUID()}${fileExtension}`;
    const destination = path.join(UPLOAD_DIR, fileName);

    fs.writeFile(destination, imagePart.data, (err) => {
      if (err) {
        sendJson(res, 500, { error: 'Failed to store upload.' });
        return;
      }

      sendJson(res, 201, {
        message: 'Image uploaded successfully.',
        fileName,
        path: `/uploads/${fileName}`
      });
    });
  });
}

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);

  if (pathname === '/upload') {
    handleUpload(req, res);
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    serveStatic(req, res, pathname);
    return;
  }

  res.setHeader('Allow', 'GET, HEAD, POST');
  sendJson(res, 405, { error: 'Method not allowed' });
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  server.listen(port, () => {
    console.log(`Server listening on http://localhost:${port}`);
  });
}

module.exports = { server };
