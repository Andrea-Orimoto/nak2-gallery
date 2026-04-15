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

function getFilenameFromUrl(url) {
  if (!url) return '';
  try {
    const decoded = decodeURIComponent(url);
    const match = decoded.match(/IMG_\d{4}\.(JPG|JPEG|HEIC|PNG|MOV|MP4)/i);
    if (match) return match[0].toUpperCase();

    const fallback = decoded.match(/([^\\/]+?\.(jpg|jpeg|heic|png|mov|mp4))/i);
    return fallback ? fallback[1].toUpperCase() : '';
  } catch {
    return '';
  }
}

async function main() {
  console.log('Fetching iCloud shared album...');

  await fsPromises.mkdir(THUMBNAILS_DIR, { recursive: true });

  // Load existing only to know which filenames already exist
  let existingIndex = {};
  try {
    const data = await fsPromises.readFile(INDEX_PATH, 'utf8');
    existingIndex = JSON.parse(data);
    console.log(`Loaded ${Object.keys(existingIndex).length} existing items`);
  } catch (e) {
    console.log('No existing index.json found – first run');
  }

  const seenFilenames = new Set();
  Object.values(existingIndex).forEach(item => {
    let fn = item.filename;
    if (!fn) fn = getFilenameFromUrl(item.fullUrl);
    if (!fn && item.derivatives) {
      for (const d of Object.values(item.derivatives)) {
        fn = getFilenameFromUrl(d.url);
        if (fn) break;
      }
    }
    if (fn) seenFilenames.add(fn);
  });

  console.log(`Known unique filenames: ${seenFilenames.size}`);

  const data = await getImages(TOKEN);
  console.log(`Total items returned by API: ${data.photos?.length || 0}`);

  const newIndex = {};   // Fresh rebuild every time
  let thumbsDownloaded = 0;
  let skippedDupes = 0;

  for (const item of data.photos || []) {
    let filename = getFilenameFromUrl(item.fullUrl);
    if (!filename && item.derivatives) {
      for (const d of Object.values(item.derivatives)) {
        filename = getFilenameFromUrl(d.url);
        if (filename) break;
      }
    }

    const isDuplicate = filename && seenFilenames.has(filename);

    if (isDuplicate) {
      skippedDupes++;
    }

    const id = item.photoGuid || item.checksum || item.id || Math.random().toString(36).slice(2);

    const derivatives = item.derivatives || {};
    const derivValues = Object.values(derivatives);

    const isVideo = 
      item.mediaAssetType === 'video' ||
      derivValues.some(d => d.url && (d.url.endsWith('.mp4') || d.url.endsWith('.mov')));

    const type = isVideo ? 'video' : 'image';

    const thumbPath = `${THUMBNAILS_DIR}/${id}.jpg`;

    let thumbSource = derivValues.find(d => d.url && (d.url.endsWith('.jpg') || d.url.endsWith('.jpeg')));
    if (!thumbSource) thumbSource = derivValues.find(d => d.url && !d.url.endsWith('.mp4'));

    let fullSource;
    if (isVideo) {
      fullSource = derivValues.find(d => d.url && d.url.endsWith('.mp4'));
    } else {
      fullSource = derivValues.reduce((best, curr) => 
        (curr.width || 0) > (best.width || 0) ? curr : best, 
        derivValues[0] || {}
      );
    }

    // Download thumbnail ONLY for new items
    if (thumbSource && thumbSource.url && !isDuplicate) {
      const success = await downloadFile(thumbSource.url, thumbPath, `THUMB ${id}`);
      if (success) thumbsDownloaded++;
    }

    // ALWAYS add the item with fresh URLs (this fixes the "not updating" problem)
    newIndex[id] = {
      id,
      type,
      dateTaken: item.assetDate || item.creationDate || item.originalDate || item.dateCreated || item.dateAdded || new Date().toISOString(),
      caption: item.caption || '',
      thumbUrl: `./thumbnails/${id}.jpg`,
      fullUrl: (fullSource && fullSource.url) ? fullSource.url : (thumbSource ? thumbSource.url : ''),
      width: fullSource?.width || 0,
      height: fullSource?.height || 0,
      derivatives: derivatives,
      filename: filename
    };

    if (filename) seenFilenames.add(filename);
  }

  await fsPromises.writeFile(INDEX_PATH, JSON.stringify(newIndex, null, 2));

  console.log(`\n✅ Updated index.json with ${Object.keys(newIndex).length} items`);
  console.log(`   Thumbnails downloaded this run: ${thumbsDownloaded}`);
  console.log(`   Duplicates skipped            : ${skippedDupes}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
});