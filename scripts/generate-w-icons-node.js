#!/usr/bin/env node
/**
 * Generate Writer AI icons with a "W" letter using pure Node.js
 * No external dependencies required!
 */

const fs = require('fs');
const path = require('path');

// SVG template for each icon size
function generateSVG(size) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <!-- Background gradient -->
  <defs>
    <linearGradient id="grad${size}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
    </linearGradient>
  </defs>

  <!-- Rounded rectangle background -->
  <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="url(#grad${size})"/>

  <!-- W letter -->
  <text
    x="${size / 2}"
    y="${size / 2}"
    font-family="Arial, Helvetica, sans-serif"
    font-size="${size * 0.6}"
    font-weight="bold"
    fill="white"
    text-anchor="middle"
    dominant-baseline="central">W</text>
</svg>`;
}

// Convert SVG to PNG data URL (for manifest, if needed)
function svgToDataURL(svg) {
  const base64 = Buffer.from(svg).toString('base64');
  return `data:image/svg+xml;base64,${base64}`;
}

function main() {
  const iconsDir = path.join(__dirname, '..', 'icons');

  // Create icons directory
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  const sizes = [16, 32, 48, 128];

  console.log('🎨 Generating Writer AI icons with "W" letter...\n');

  sizes.forEach(size => {
    const svg = generateSVG(size);
    const svgPath = path.join(iconsDir, `icon${size}.svg`);

    // Save SVG file
    fs.writeFileSync(svgPath, svg);
    console.log(`✅ Created ${path.relative(path.join(__dirname, '..'), svgPath)}`);
  });

  // Also create a generic icon.svg
  const genericSVG = generateSVG(128);
  const genericPath = path.join(iconsDir, 'icon.svg');
  fs.writeFileSync(genericPath, genericSVG);
  console.log(`✅ Created ${path.relative(path.join(__dirname, '..'), genericPath)}`);

  console.log('\n✨ Icons generated successfully!');
  console.log('\n📝 Note: Chrome extensions support SVG icons natively.');
  console.log('   You can use these SVG files directly in your manifest.');
  console.log('\n   If you need PNG files, you can:');
  console.log('   1. Open scripts/create-icons.html in your browser');
  console.log('   2. Use an online SVG to PNG converter');
  console.log('   3. Use ImageMagick: convert icon.svg icon.png');
}

if (require.main === module) {
  main();
}

module.exports = { generateSVG, svgToDataURL };
