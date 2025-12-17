// Generate simple "W" icons for Writer AI extension
const fs = require('fs');
const path = require('path');

// Simple canvas-like implementation for Node.js
function generateIcon(size) {
  // SVG approach - simpler and works without canvas
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <!-- Background gradient -->
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
    </linearGradient>
  </defs>

  <!-- Rounded rectangle background -->
  <rect width="${size}" height="${size}" rx="${size * 0.2}" fill="url(#grad)"/>

  <!-- W letter -->
  <text
    x="50%"
    y="50%"
    font-family="Arial, sans-serif"
    font-size="${size * 0.6}"
    font-weight="bold"
    fill="white"
    text-anchor="middle"
    dominant-baseline="central">W</text>
</svg>`;

  return svg;
}

// Convert SVG to PNG using a more compatible approach
async function svgToPng(svg, size, outputPath) {
  // For now, just save the SVG
  // In a real implementation, you would use a library like sharp or canvas
  // But for Chrome extensions, SVG icons work fine
  const svgPath = outputPath.replace('.png', '.svg');
  fs.writeFileSync(svgPath, svg);

  console.log(`Created ${svgPath}`);

  // Also create a simple PNG fallback using data
  // This is a placeholder - in production you'd use proper SVG->PNG conversion
  console.log(`Note: For ${outputPath}, using SVG instead. Chrome supports SVG icons.`);
}

async function generateIcons() {
  const iconsDir = path.join(__dirname, '..', 'icons');

  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  const sizes = [16, 32, 48, 128];

  console.log('Generating Writer AI icons with "W" letter...');

  for (const size of sizes) {
    const svg = generateIcon(size);
    const outputPath = path.join(iconsDir, `icon${size}.png`);
    await svgToPng(svg, size, outputPath);
  }

  console.log('\n✅ Icons generated successfully!');
  console.log('Note: SVG files were created. For best compatibility, convert them to PNG using a tool like:');
  console.log('  - ImageMagick: convert icon.svg icon.png');
  console.log('  - Online converters: cloudconvert.com, etc.');
  console.log('\nOr just use the SVG files directly - Chrome supports them!');
}

generateIcons().catch(console.error);
