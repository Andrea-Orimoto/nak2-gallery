import { getImages } from 'icloud-shared-album';
import fs from 'fs';
import fsPromises from 'fs/promises';
import https from 'https';
import { pipeline } from 'stream/promises';

const TOKEN = 'B1uG6XBubuvcunC';
const INDEX_PATH = './index.json';
const THUMBNAILS_DIR = './thumbnails';

const DOWNLOAD_TIMEOUT = 25000;

async function downloadFile(url, destPath, label) {
  if (!url) return false;

  const exists = await fsPromises.access(destPath).then(() => true).catch(() => false);
  if (exists) return true;

  console.log(`  Downloading ${label}...`);

  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error('timeout')), DOWNLOAD_TIMEOUT)
  );

  const downloadPromise = new Promise((resolve) => {
    const file = fs.createWriteStream(destPath);

    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        console.log(`  [${label}] Failed - HTTP ${response.statusCode}`);
        file.close();
        resolve(false);
        return;
      }

      pipeline(response, file)
        .then(() => resolve(true))
        .catch((err) => {
          console.log(`  [${label}] Pipeline error: ${err.message}`);
          resolve(false);
        });
    }).on('error', (err) => {
      console.log(`  [${label}] Request error: ${err.message}`);
      resolve(false);
    });
  });

  try {
    const success = await Promise.race([downloadPromise, timeoutPromise]);
    if (success) {
      console.log(`  [${label}] Success`);
      return true;
    }
    return false;
  } catch (err) {
    console.log(`  [${label}] Timed out`);
    return false;
  }
}

async function main() {
  console.log('Fetching iCloud shared album...');

  await fsPromises.mkdir(THUMBNAILS_DIR, { recursive: true });

  const data = await getImages(TOKEN);
  console.log(`Total items returned by API: ${data.photos?.length || 0}`);

  const newIndex = {};
  let thumbsDownloaded = 0;

  for (const item of data.photos || []) {
    const id = item.photoGuid || item.checksum || item.id || Math.random().toString(36).slice(2);

    const derivatives = item.derivatives || {};
    const derivValues = Object.values(derivatives);

    const isVideo = 
      item.mediaAssetType === 'video' ||
      derivValues.some(d => d.url && (d.url.endsWith('.mp4') || d.url.endsWith('.mov')));

    const type = isVideo ? 'video' : 'image';

    const thumbPath = `${THUMBNAILS_DIR}/${id}.jpg`;

    // Find best thumbnail source
    let thumbSource = derivValues.find(d => d.url && (d.url.endsWith('.jpg') || d.url.endsWith('.jpeg')));
    if (!thumbSource) thumbSource = derivValues.find(d => d.url && !d.url.endsWith('.mp4'));

    // Download thumbnail only
    if (thumbSource && thumbSource.url) {
      const success = await downloadFile(thumbSource.url, thumbPath, `THUMB ${id}`);
      if (success) thumbsDownloaded++;
    }

    newIndex[id] = {
      id,
      type,
      dateTaken: item.assetDate || item.creationDate || item.originalDate || item.dateCreated || item.dateAdded || new Date().toISOString(),
      caption: item.caption || '',
      thumbUrl: `./thumbnails/${id}.jpg`,
      // fullUrl points to the original iCloud link (fresh on each update)
      fullUrl: thumbSource ? thumbSource.url : (derivValues[0] ? derivValues[0].url : ''),
      width: 0,
      height: 0,
      derivatives: derivatives
    };
  }

  await fsPromises.writeFile(INDEX_PATH, JSON.stringify(newIndex, null, 2));

  console.log(`\n✅ Updated index.json with ${Object.keys(newIndex).length} items`);
  console.log(`   Thumbnails downloaded this run: ${thumbsDownloaded}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
});