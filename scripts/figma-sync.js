import fs from 'fs';
import path from 'path';

const FIGMA_TOKEN = process.env.FIGMA_TOKEN || '';
const FILE_KEY = 'uw6VIQZS0XTYZxREWvcR5S';

async function fetchFigmaImages() {
  console.log('Fetching image fills for the document...');
  const res = await fetch(`https://api.figma.com/v1/files/${FILE_KEY}/images`, {
    headers: { 'X-Figma-Token': FIGMA_TOKEN }
  });
  
  if (!res.ok) {
    console.error('Failed to fetch images:', await res.text());
    return;
  }
  
  const data = await res.json();
  const images = data.meta?.images;
  if (!images) {
    console.log('No images found in the document.');
    return;
  }
  
  const outputDir = path.join(process.cwd(), 'public', 'figma');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  
  console.log(`Found ${Object.keys(images).length} image fills. Downloading...`);
  
  for (const [imageRef, url] of Object.entries(images)) {
    try {
      const imgRes = await fetch(url);
      const buffer = await imgRes.arrayBuffer();
      const ext = 'png';
      const filePath = path.join(outputDir, `${imageRef}.${ext}`);
      fs.writeFileSync(filePath, Buffer.from(buffer));
      console.log(`Saved ${imageRef}.${ext}`);
    } catch (e) {
      console.error(`Failed to download ${imageRef}:`, e.message);
    }
  }
  
  console.log('Done downloading images.');
}

fetchFigmaImages();
