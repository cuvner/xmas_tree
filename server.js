const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const S3_BUCKET = process.env.S3_BUCKET;
const AWS_REGION = process.env.AWS_REGION;
const ASSET_BASE_URL = process.env.ASSET_BASE_URL || (S3_BUCKET ? `https://${S3_BUCKET}.s3.amazonaws.com` : null);
let s3Client;
let PutObjectCommand;
let ListObjectsV2Command;

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
    void processUpload(parts, res);
  });
}

async function processUpload(parts, res) {
  try {
    const imagePart = extractImagePart(parts);

    if (!imagePart) {
      sendJson(res, 400, { error: 'No image file provided in field "image".' });
      return;
    }

    const sniffedMime = detectMimeType(imagePart.data);
    if (!sniffedMime) {
      sendJson(res, 400, { error: 'Unsupported or invalid image format.' });
      return;
    }

    const extensionMap = {
      'image/png': '.png',
      'image/jpeg': '.jpg',
      'image/gif': '.gif',
      'image/webp': '.webp'
    };

    const fileExtension = extensionMap[sniffedMime] || '.img';
    const fileName = `${randomUUID()}${fileExtension}`;
    const storedPath = await storeImage(imagePart.data, sniffedMime, fileName);

    sendJson(res, 201, {
      message: 'Image uploaded successfully.',
      fileName,
      path: storedPath
    });
    console.log(`Uploaded ${fileName} -> ${storedPath}`);
  } catch (err) {
    console.error('Upload failed:', err);
    const status = err.statusCode || err.httpStatusCode || 500;
    sendJson(res, status, { error: err.message || 'Failed to store upload.' });
  }
}

function extractImagePart(parts) {
  return parts.find((part) => {
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
}

async function storeImage(buffer, mimeType, fileName) {
  if (S3_BUCKET) {
    return storeToS3(buffer, mimeType, fileName);
  }
  return storeToDisk(buffer, fileName);
}

async function storeToDisk(buffer, fileName) {
  const destination = path.join(UPLOAD_DIR, fileName);
  await fs.promises.writeFile(destination, buffer);
  return `/uploads/${fileName}`;
}

async function storeToS3(buffer, mimeType, fileName) {
  ensureS3Client();

  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: fileName,
    Body: buffer,
    ContentType: mimeType,
    ACL: process.env.S3_ACL || 'public-read'
  });

  await s3Client.send(command);
  return `${ASSET_BASE_URL || `https://${S3_BUCKET}.s3.amazonaws.com`}/${fileName}`;
}

function ensureS3Client() {
  if (s3Client) return;
  try {
    const aws = require('@aws-sdk/client-s3');
    s3Client = new aws.S3Client({ region: AWS_REGION });
    PutObjectCommand = aws.PutObjectCommand;
    ListObjectsV2Command = aws.ListObjectsV2Command;
  } catch (err) {
    err.message = 'S3 client not available. Install @aws-sdk/client-s3 and set AWS_REGION.';
    throw err;
  }
}

function handleListImages(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  listImages()
    .then((images) => sendJson(res, 200, images))
    .catch((err) => {
      console.error('List images failed:', err);
      sendJson(res, 500, { error: 'Failed to list images.' });
    });
}

async function listImages() {
  if (S3_BUCKET) {
    return listImagesFromS3();
  }
  return listImagesFromDisk();
}

async function listImagesFromDisk() {
  const files = await fs.promises.readdir(UPLOAD_DIR);
  return files
    .filter((f) => /\.(png|jpe?g|gif|webp)$/i.test(f))
    .map((f) => `/uploads/${f}`);
}

async function listImagesFromS3() {
  ensureS3Client();
  const command = new ListObjectsV2Command({
    Bucket: S3_BUCKET,
    MaxKeys: 100
  });
  const result = await s3Client.send(command);
  const items = result.Contents || [];
  return items
    .filter((obj) => obj.Key)
    .map((obj) => buildPublicUrl(obj.Key));
}

function buildPublicUrl(key) {
  const base = ASSET_BASE_URL || `https://${S3_BUCKET}.s3.amazonaws.com`;
  return `${base}/${encodeURIComponent(key)}`;
}

function detectMimeType(buffer) {
  if (!buffer || buffer.length < 12) return null;

  // PNG
  if (buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }

  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    return 'image/jpeg';
  }

  // GIF87a / GIF89a
  if (buffer.slice(0, 6).toString('ascii') === 'GIF87a' || buffer.slice(0, 6).toString('ascii') === 'GIF89a') {
    return 'image/gif';
  }

  // WebP RIFF header
  if (
    buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
    buffer.slice(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  return null;
}

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host}`);

  if (pathname === '/upload') {
    handleUpload(req, res);
    return;
  }

  if (pathname === '/images') {
    handleListImages(req, res);
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
