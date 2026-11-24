// Generates public/og.png (1200x630 share image) from the brand mark. Interim until #4.
import sharp from 'sharp';
import fs from 'node:fs';
const mark = fs.readFileSync('branding/logo/mark.svg');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
<rect width="1200" height="630" fill="#fbfaf7"/><rect width="1200" height="14" y="616" fill="#ff6a13"/>
<text x="80" y="330" font-family="Overpass, Helvetica, Arial, sans-serif" font-weight="800" font-size="92" fill="#0b5aa6">Straatwijsheid</text>
<text x="84" y="410" font-family="Overpass, Helvetica, Arial, sans-serif" font-size="40" fill="#1b1f2a">What are Dutch streets named after?</text>
<text x="84" y="470" font-family="Overpass, Helvetica, Arial, sans-serif" font-size="32" fill="#4b5263">A person, a place or a thing. Open map and dataset.</text></svg>`;
const m = await sharp(mark).resize(260, 260).png().toBuffer();
await sharp(Buffer.from(svg)).composite([{ input: m, left: 880, top: 185 }]).png().toFile('public/og.png');
