import { getImages } from 'icloud-shared-album';
import fs from 'fs';
import fsPromises from 'fs/promises';
import https from 'https';
import { pipeline } from 'stream/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const TOKEN = 'B1uG6XBubuvcunC';
const INDEX_PATH = './index.json';
const THUMBNAILS_DIR = './thumbnails';

const DOWNLOAD_TIMEOUT = 25000;

/* ---------------- VIDEO THUMBNAIL HELPERS ---------------- */

async function downloadVideo(url, tempPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(tempPath);

    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        file.close();
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      pipeline(response, file).then(resolve).catch(reject);
    }).on('error', reject);
  });
}

async function extractThumbnail(videoUrl, outputPath, id) {
  const tempPath = `${outputPath}.tmp.mp4`;

  try {
    await downloadVideo(videoUrl, tempPath);

    try {
      await execFileAsync('ffmpeg', [
        '-y',
        '-i', tempPath,
        '-frames:v', '1',
        '-q:v', '2',
        '-vf', 'scale=640:-1',
        outputPath
      ]);

      await fsPromises.unlink(tempPath).catch(() => {});
      return true;
    } catch {}

    const timestamps = ['00:00:00.5', '00:00:01'];

    for (const ts of timestamps) {
      try {
        await execFileAsync('ffmpeg', [
          '-y',
          '-ss', ts,
          '-i', tempPath,
          '-frames:v', '1',
          '-q:v', '2',
          '-vf', 'scale=640:-1',
          outputPath
        ]);

        await fsPromises.unlink(tempPath).catch(() => {});
        return true;
      } catch {}
    }

    await fsPromises.unlink(tempPath).catch(() => {});
    return false;

  } catch (err) {
    console.log(`[VIDEO ${id}] ERROR: ${err.message}`);
    await fsPromises.unlink(tempPath).catch(() => {});
    return false;
  }
}

/* ---------------- IMAGE DOWNLOAD ---------------- */

async function downloadFile(url, destPath, label) {
  if (!url) return false;

  const exists = await fsPromises.access(destPath).then(() => true).catch(() => false);
  if (exists) return true;

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), DOWNLOAD_TIMEOUT)
  );

  const downloadPromise = new Promise((resolve) => {
    const file = fs.createWriteStream(destPath);

    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        file.close();
        resolve(false);
        return;
      }

      pipeline(response, file)
        .then(() => resolve(true))
        .catch(() => resolve(false));
    }).on('error', () => resolve(false));
  });

  try {
    return await Promise.race([downloadPromise, timeoutPromise]);
  } catch {
    return false;
  }
}

/* ---------------- SAFE FILENAME PARSER ---------------- */

function getFilenameFromUrl(url) {
  if (!url) return '';

  try {
    let decoded;
    try {
      decoded = decodeURIComponent(url);
    } catch {
      decoded = url;
    }

    const match = decoded.match(/IMG_\d{4}\.(JPG|JPEG|HEIC|PNG|MOV|MP4)/i);
    if (match) return match[0].toUpperCase();

    const fallback = decoded.match(/([^\\/]+?\.(jpg|jpeg|heic|png|mov|mp4))/i);
    return fallback ? fallback[1].toUpperCase() : '';
  } catch {
    return '';
  }
}

/* ---------------- MAIN ---------------- */

async function main() {
  console.log('Fetching iCloud shared album...');

  await fsPromises.mkdir(THUMBNAILS_DIR, { recursive: true });

  let existingIndex = {};
  try {
    const data = await fsPromises.readFile(INDEX_PATH, 'utf8');
    existingIndex = JSON.parse(data);
    console.log(`Loaded ${Object.keys(existingIndex).length} existing items`);
  } catch {
    console.log('No existing index.json found – first run');
  }

  const filenameToId = new Map();
  const cleanedIndex = {};

  for (const [id, item] of Object.entries(existingIndex)) {
    let fn = item.filename;
    if (!fn) fn = getFilenameFromUrl(item.fullUrl);

    if (!fn && item.derivatives) {
      for (const d of Object.values(item.derivatives)) {
        fn = getFilenameFromUrl(d.url);
        if (fn) break;
      }
    }

    if (!fn) continue;

    if (!filenameToId.has(fn)) {
      filenameToId.set(fn, id);
      cleanedIndex[id] = { ...item, filename: fn };
    }
  }

  const data = await getImages(TOKEN);

  console.log(`Photos returned: ${data.photos?.length || 0}`);

  const newIndex = { ...cleanedIndex };

  let i = 0;

  for (const item of data.photos || []) {
    console.log(`\n--- Processing item ${i++} ---`);

    let filename = getFilenameFromUrl(item.fullUrl);

    if (!filename && item.derivatives) {
      for (const d of Object.values(item.derivatives)) {
        filename = getFilenameFromUrl(d.url);
        if (filename) break;
      }
    }

    const derivatives = item.derivatives || {};
    const derivValues = Object.values(derivatives);

    const isVideo =
      item.mediaAssetType === 'video' ||
      derivValues.some(d => d.url?.includes('.mp4') || d.url?.includes('.mov'));

    console.log('filename:', filename, 'isVideo:', isVideo);

    let thumbSource = derivValues.find(d => d.url?.includes('.jpg') || d.url?.includes('.jpeg'));
    if (!thumbSource) thumbSource = derivValues.find(d => d.url && !d.url.includes('.mp4'));

    let fullSource;
    if (isVideo) {
      fullSource = derivValues.find(d => d.url?.includes('.mp4'));
    } else {
      fullSource = derivValues.reduce((best, curr) =>
        (curr.width || 0) > (best.width || 0) ? curr : best,
        derivValues[0] || {}
      );
    }

    const id =
      filenameToId.get(filename) ||
      item.photoGuid ||
      item.checksum ||
      item.id ||
      Math.random().toString(36).slice(2);

    const thumbPath = `${THUMBNAILS_DIR}/${id}.jpg`;

    // CASE 1: Existing filename → update metadata/URLs only
    if (filename && filenameToId.has(filename)) {
      const existingId = filenameToId.get(filename);

      if (thumbSource?.url) {
        await downloadFile(thumbSource.url, thumbPath, `THUMB ${existingId}`);
      }

      newIndex[existingId] = {
        ...newIndex[existingId],
        type: isVideo ? 'video' : 'image',
        fullUrl: fullSource?.url || thumbSource?.url || '',
        derivatives,
        width: fullSource?.width || 0,
        height: fullSource?.height || 0,
        filename
      };

      continue;
    }

    // CASE 2: New item → add to index and generate video thumbnail only for new videos
    if (filename) {
      if (thumbSource?.url) {
        await downloadFile(thumbSource.url, thumbPath, `THUMB ${id}`);
      }

      if (isVideo) {
        const videoUrl =
          fullSource?.url ||
          derivValues.find(d => d.url?.includes('.mp4'))?.url;

        if (videoUrl) {
          console.log(`[VIDEO ${id}] extracting thumbnail`);

          const timeout = new Promise(resolve =>
            setTimeout(() => {
              console.log(`[VIDEO ${id}] TIMEOUT`);
              resolve(false);
            }, 60000)
          );

          await Promise.race([
            extractThumbnail(videoUrl, thumbPath, id),
            timeout
          ]);
        }
      }

      newIndex[id] = {
        id,
        type: isVideo ? 'video' : 'image',
        dateTaken:
          item.assetDate ||
          item.creationDate ||
          item.originalDate ||
          item.dateCreated ||
          item.dateAdded ||
          new Date().toISOString(),
        caption: item.caption || '',
        thumbUrl: `./thumbnails/${id}.jpg`,
        fullUrl: fullSource?.url || thumbSource?.url || '',
        width: fullSource?.width || 0,
        height: fullSource?.height || 0,
        derivatives,
        filename
      };

      filenameToId.set(filename, id);
    }
  }

  await fsPromises.writeFile(INDEX_PATH, JSON.stringify(newIndex, null, 2));

  console.log(`\nDone. Items: ${Object.keys(newIndex).length}`);
}

main().catch(err => console.error('Fatal error:', err));