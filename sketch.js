// sketch.js
// Christmas tree made from uploaded photos
// - Preview fits your screen
// - A0 export with no text and no background colour (white only)
// - Star + baubles + trunk + tree made of images

let images = [];
let fileInput;
let saveBtn;

const rows = 10;     // 10 rows → 100 image slots
const totalSlots = rows * rows;

// A0 portrait ratio (height = width * sqrt(2))
const A0_EXPORT_WIDTH = 3000;
const A0_EXPORT_HEIGHT = Math.round(A0_EXPORT_WIDTH * Math.SQRT2);

let previewBaubles = [];
const NUM_BAUBLES = 20;

function setup() {
  createScreenCanvas();
  imageMode(CENTER);

  fileInput = createFileInput(handleFile);
  fileInput.position(10, 10);

  saveBtn = createButton("Save A0 JPEG");
  saveBtn.position(10, 40);
  saveBtn.mousePressed(saveA0Image);

  previewBaubles = generateBaubles(width, height);
  loadExistingImages();
}

function windowResized() {
  createScreenCanvas();
  previewBaubles = generateBaubles(width, height);
}

function draw() {
  // Draw preview with ONLY the tree, no text, no blue background
  background(255); // white preview
  drawScene(null, width, height, true, previewBaubles);
}

//
// SCREEN CANVAS — always fits your display but keeps A-series ratio
//
function createScreenCanvas() {
  let ratio = Math.SQRT2;
  let w = windowWidth;
  let h = w * ratio;

  if (h > windowHeight) {
    h = windowHeight;
    w = h / ratio;
  }

  if (this._renderer) {
    resizeCanvas(w, h);
  } else {
    createCanvas(w, h);
  }
}

//
// SAVE A0 — draws clean version into offscreen buffer
//
function saveA0Image() {
  let pg = createGraphics(A0_EXPORT_WIDTH, A0_EXPORT_HEIGHT);
  pg.imageMode(CENTER);
  pg.background(255); // white print background only

  let exportBaubles = generateBaubles(A0_EXPORT_WIDTH, A0_EXPORT_HEIGHT);

  drawScene(pg, A0_EXPORT_WIDTH, A0_EXPORT_HEIGHT, false, exportBaubles);

  save(pg, "xmas_tree_A0", "jpg");
  pg.remove();
}

//
// MAIN TREE DRAWING (shared preview + export)
//
function drawScene(g, w, h, preview, baublesList) {
  drawTreeImages(g, w, h);
  drawBaubles(g, baublesList);
  drawTrunk(g, w, h);
  drawStar(g, w, h, preview);
}

//
// TREE IMAGE TILES
//
function drawTreeImages(g, w, h) {
  if (images.length === 0) return;

  let treeHeight = h * 0.7;
  let topY = h * 0.1;
  let rowHeight = treeHeight / rows;
  let maxRowWidth = w * 0.75;

  let imgIndex = 0;

  for (let row = 0; row < rows; row++) {
    let slots = 2 * row + 1;
    let y = topY + row * rowHeight;

    let rowWidth = map(row, 0, rows - 1, maxRowWidth * 0.2, maxRowWidth);
    let slotWidth = rowWidth / slots;
    let size = slotWidth;

    let startX = w / 2 - rowWidth / 2 + slotWidth / 2;

    for (let i = 0; i < slots; i++) {
      let x = startX + i * slotWidth;
      let img = images[imgIndex % images.length];
      imgIndex++;

      if (g) g.image(img, x, y, size, size);
      else image(img, x, y, size, size);
    }
  }
}

//
// TRUNK
//
function drawTrunk(g, w, h) {
  let trunkW = w * 0.08;
  let trunkH = h * 0.12;
  let x = w / 2;
  let y = h * 0.82;

  if (g) {
    g.fill(80, 50, 30);
    g.rectMode(CENTER);
    g.rect(x, y, trunkW, trunkH, 10);
  } else {
    fill(80, 50, 30);
    rectMode(CENTER);
    rect(x, y, trunkW, trunkH, 10);
  }
}

//
// STAR ON TOP
//
function drawStar(g, w, h, animated) {
  let x = w / 2;
  let y = h * 0.08;
  let outer = h * 0.045;
  let inner = h * 0.02;

  let angle = animated ? frameCount * 0.1 : 0;

  if (g) g.push(); else push();
  if (g) g.translate(x, y); else translate(x, y);
  if (g) g.rotate(radians(angle)); else rotate(radians(angle));

  drawStarShape(g, 0, 0, outer, inner, 5);

  if (g) g.pop(); else pop();
}

function drawStarShape(g, x, y, r1, r2, n) {
  let angle = TWO_PI / n;
  let half = angle / 2;

  if (g) { g.fill(255, 215, 0); g.noStroke(); g.beginShape(); }
  else { fill(255, 215, 0); noStroke(); beginShape(); }

  for (let a = 0; a < TWO_PI; a += angle) {
    let sx1 = x + cos(a) * r1;
    let sy1 = y + sin(a) * r1;
    let sx2 = x + cos(a + half) * r2;
    let sy2 = y + sin(a + half) * r2;

    if (g) { g.vertex(sx1, sy1); g.vertex(sx2, sy2); }
    else { vertex(sx1, sy1); vertex(sx2, sy2); }
  }

  if (g) g.endShape(CLOSE);
  else endShape(CLOSE);
}

//
// BAUBLES
//
function generateBaubles(w, h) {
  let arr = [];
  let maxRowWidth = w * 0.75;
  let treeHeight = h * 0.5;
  let topY = h * 0.1;
  let rowH = treeHeight / rows;

  for (let i = 0; i < NUM_BAUBLES; i++) {
    let row = floor(random(rows));
    let slots = 2 * row + 1;

    let y = topY + row * rowH;

    let rw = map(row, 0, rows - 1, maxRowWidth * 0.2, maxRowWidth);
    let slotW = rw / slots;
    let startX = w / 2 - rw / 2 + slotW / 2;

    let col = random([
      [220, 30, 50],
      [30, 120, 220],
      [230, 200, 40],
      [180, 40, 180],
      [40, 200, 120]
    ]);

    arr.push({
      x: startX + floor(random(slots)) * slotW,
      y,
      size: random(slotW * 0.4, slotW * 0.7),
      col
    });
  }

  return arr;
}

function drawBaubles(g, list) {
  for (let b of list) {
    if (g) {
      g.noStroke();
      g.fill(...b.col);
      g.circle(b.x, b.y, b.size);
      g.fill(255, 180);
      g.circle(b.x - b.size * 0.2, b.y - b.size * 0.2, b.size * 0.25);
    } else {
      noStroke();
      fill(...b.col);
      circle(b.x, b.y, b.size);
      fill(255, 180);
      circle(b.x - b.size * 0.2, b.y - b.size * 0.2, b.size * 0.25);
    }
  }
}

//
// FILE UPLOAD
//
function handleFile(file) {
  if (file.type === "image") {
    uploadToServer(file.file || file)
      .then((url) => {
        loadImage(url, (img) => images.push(img), (err) => {
          console.error('Failed to load uploaded image:', err);
        });
      })
      .catch((err) => {
        console.error('Upload failed:', err);
      });
  }
}

async function uploadToServer(imageFile) {
  const formData = new FormData();
  formData.append('image', imageFile);

  const response = await fetch('/upload', {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Upload failed');
  }

  const data = await response.json();
  return data.path;
}

async function loadExistingImages() {
  try {
    const res = await fetch('/images');
    if (!res.ok) return;
    const list = await res.json();
    for (const url of list) {
      loadImage(url, (img) => images.push(img));
    }
  } catch (err) {
    console.error('Failed to load existing images:', err);
  }
}
