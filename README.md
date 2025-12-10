# Xmas Tree

A simple Node.js host for the interactive holiday tree front-end. The server serves the static files and accepts image uploads.

## Running locally

1. Install [Node.js](https://nodejs.org/) (v18 or newer recommended).
2. Install dependencies:

```bash
npm install
```

3. From the project root, start the server:

```bash
npm start
```

The site is served from the same server at `http://localhost:3000/` by default.

Local uploads are stored in `uploads/` on disk. When deploying to Heroku you must back uploads with S3 (dyno files are ephemeral).

Open `http://localhost:3000/` in your browser, click the file chooser, and the image will be POSTed to `/upload` then loaded into the tree from its saved URL (local file system or S3).

## Deploying to Heroku with S3

1. Create an S3 bucket and an IAM user with write access. Note the bucket name, region, access key, and secret.
2. Install the Heroku CLI and log in:

```bash
heroku login
```

3. Create the app (replace `your-app-name`):

```bash
heroku create your-app-name
```

4. Add environment variables so uploads go to S3:

```bash
heroku config:set \
  S3_BUCKET=your-bucket-name \
  AWS_REGION=your-region \
  AWS_ACCESS_KEY_ID=your-key \
  AWS_SECRET_ACCESS_KEY=your-secret \
  ASSET_BASE_URL=https://your-bucket-name.s3.amazonaws.com \
  S3_ACL=public-read
```

5. Deploy:

```bash
git push heroku main
```

6. Open the site:

```bash
heroku open
```

Uploaded images will be written to S3 and the API responds with the public URL.

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
