import { getImages } from 'icloud-shared-album';
import fs from 'fs/promises';

const TOKEN = 'B1uG6XBubuvcunC';
const INDEX_PATH = './index.json';

async function main() {
  console.log('Fetching iCloud shared album...');
  
  const data = await getImages(TOKEN);

  console.log(`Total items returned by API: ${data.photos?.length || 0}`);

  const newIndex = {};

  for (const item of data.photos || []) {
    const id = item.photoGuid || item.checksum || item.id || Math.random().toString(36).slice(2);

    // Final robust video detection for your album
    const derivatives = item.derivatives || {};
    const derivValues = Object.values(derivatives);

    const isVideo = 
      item.mediaAssetType === 'video' ||                    // ← This was the missing key!
      derivValues.some(d => d.url && d.url.endsWith('.mp4')) ||
      derivValues.some(d => d.url && d.url.endsWith('.mov')) ||
      derivValues.some(d => d.url && d.url.includes('video'));

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