import { getImages } from 'icloud-shared-album';
import fs from 'fs/promises';

const TOKEN = 'B1uG6XBubuvcunC';
const INDEX_PATH = './public/index.json';   // Make sure this matches your folder structure

async function main() {
  console.log('Fetching iCloud shared album...');
  
  const data = await getImages(TOKEN);

  console.log(`Total items returned by API: ${data.photos?.length || 0}`);

  const newIndex = {};

  for (const item of data.photos || []) {
    const id = item.photoGuid || item.checksum || item.id || Math.random().toString(36).slice(2);

    // Improved video detection
    const derivatives = item.derivatives || {};
    const derivValues = Object.values(derivatives);

    const isVideo = 
      derivValues.some(d => 
        d.url && (
          d.url.endsWith('.mp4') || 
          d.url.endsWith('.mov') || 
          d.url.includes('video') || 
          d.url.includes('720p') || 
          d.url.includes('1080p')
        )
      ) ||
      item.mediaType === 'video' ||
      item.assetType === 'video' ||
      (item.caption && item.caption.toLowerCase().includes('video'));

    const type = isVideo ? 'video' : 'image';

    // Pick best derivatives
    const sorted = [...derivValues].sort((a, b) => 
      (b.width || 0) - (a.width || 0) || (b.fileSize || 0) - (a.fileSize || 0)
    );

    const thumb = derivValues.find(d => (d.width || 0) >= 300 && (d.width || 0) <= 800) || derivValues[0];
    const full = sorted[0] || thumb;

    newIndex[id] = {
      id,
      type,
      dateTaken: item.assetDate ||
                 item.creationDate ||
                 item.originalDate ||
                 item.dateCreated ||
                 item.dateAdded ||
                 new Date().toISOString(),
      caption: item.caption || '',
      thumbUrl: thumb?.url || '',
      fullUrl: full?.url || '',
      width: full?.width || 0,
      height: full?.height || 0,
      derivatives: derivatives
    };
  }

  await fs.writeFile(INDEX_PATH, JSON.stringify(newIndex, null, 2));
  
  const videoCount = Object.values(newIndex).filter(i => i.type === 'video').length;
  
  console.log(`✅ Updated index.json with ${Object.keys(newIndex).length} items`);
  console.log(`   Videos detected: ${videoCount}`);
}

main().catch(err => {
  console.error('Error updating index:', err);
});