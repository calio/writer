/**
 * Simple icon generator for TweetCraft AI
 * Run with: node scripts/generate-icons.js
 * 
 * This creates basic PNG icons. For production, replace with proper designed icons.
 */

const fs = require('fs');
const path = require('path');

// Simple PNG header generator for solid color icons
// This creates minimal valid PNG files

function createPNG(size, r, g, b) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  
  // IHDR chunk
  const width = size;
  const height = size;
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 2;  // color type (RGB)
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  
  const ihdrChunk = createChunk('IHDR', ihdrData);
  
  // IDAT chunk (image data)
  const zlib = require('zlib');
  
  // Create raw image data (filter byte + RGB for each pixel per row)
  const rawData = Buffer.alloc((1 + width * 3) * height);
  
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + width * 3);
    rawData[rowStart] = 0; // No filter
    
    for (let x = 0; x < width; x++) {
      const pixelStart = rowStart + 1 + x * 3;
      
      // Create gradient effect
      const centerX = width / 2;
      const centerY = height / 2;
      const dx = (x - centerX) / centerX;
      const dy = (y - centerY) / centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      // Gradient from primary color to secondary
      const t = Math.min(1, dist);
      const r1 = 99, g1 = 102, b1 = 241;  // #6366f1
      const r2 = 139, g2 = 92, b2 = 246;  // #8b5cf6
      
      rawData[pixelStart] = Math.round(r1 + (r2 - r1) * t);
      rawData[pixelStart + 1] = Math.round(g1 + (g2 - g1) * t);
      rawData[pixelStart + 2] = Math.round(b1 + (b2 - b1) * t);
    }
  }
  
  const compressedData = zlib.deflateSync(rawData, { level: 9 });
  const idatChunk = createChunk('IDAT', compressedData);
  
  // IEND chunk
  const iendChunk = createChunk('IEND', Buffer.alloc(0));
  
  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = crc32(crcData);
  
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc >>> 0, 0);
  
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

// CRC32 implementation
function crc32(data) {
  let crc = 0xffffffff;
  const table = makeCRCTable();
  
  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xff];
  }
  
  return crc ^ 0xffffffff;
}

function makeCRCTable() {
  const table = new Array(256);
  
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = ((c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1));
    }
    table[n] = c;
  }
  
  return table;
}

// Generate icons
const sizes = [16, 32, 48, 128];
const iconsDir = path.join(__dirname, '..', 'icons');

if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

sizes.forEach(size => {
  const png = createPNG(size, 99, 102, 241);
  const filename = path.join(iconsDir, `icon${size}.png`);
  fs.writeFileSync(filename, png);
  console.log(`Created ${filename}`);
});

console.log('\nIcons generated successfully!');
console.log('For better icons, replace these with properly designed PNG files.');

