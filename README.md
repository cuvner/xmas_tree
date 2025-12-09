# Xmas Tree

A simple Node.js host for the interactive holiday tree front-end. The server serves the static files and accepts image uploads.

## Running locally

1. Install [Node.js](https://nodejs.org/) (v18 or newer recommended).
2. From the project root, start the server:

```bash
npm start
```

The site is served from the same server at `http://localhost:3000/` by default.

## Testing the server

1. Start the server in one terminal:

   ```bash
   npm start
   ```

2. In another terminal, verify the static site is reachable:

   ```bash
   curl -I http://localhost:3000/
   ```

   You should see a `200 OK` response for `index.html`.

3. Exercise the upload endpoint with a sample image (replace the file path with one on your machine):

   ```bash
   curl -X POST http://localhost:3000/upload \
     -F "image=@/path/to/picture.png"
   ```

   A successful request returns JSON containing the stored filename and path, and the file appears under `uploads/`.

## Uploading images

Send a `POST` request to `/upload` with `multipart/form-data` containing an `image` field. Example using `curl`:

```bash
curl -X POST http://localhost:3000/upload \
  -F "image=@/path/to/picture.png"
```

Successful uploads are written to the `uploads/` directory with a generated filename, and the response contains the stored file name and path.
