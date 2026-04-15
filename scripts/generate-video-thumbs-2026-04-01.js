import fs from 'fs';
import fsPromises from 'fs/promises';
import https from 'https';
import { pipeline } from 'stream/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const INDEX_PATH = './index.json';
const THUMBNAILS_DIR = './thumbnails';
const TARGET_DATE = '2026-04-03';

async function downloadVideo(url, tempPath) {
  console.log(`  Downloading video...`);
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(tempPath);
    https.get(url, (response) => {
      console.log(`  Download HTTP status: ${response.statusCode}`);
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
    console.log(`\n[VIDEO ${id}] Starting thumbnail extraction...`);

    await downloadVideo(videoUrl, tempPath);
    const size = (await fsPromises.stat(tempPath)).size;
    console.log(`[VIDEO ${id}] Video downloaded (${size} bytes)`);

    // Simple first frame - most reliable
    try {
      await execFileAsync('ffmpeg', [
        '-y', '-i', tempPath, '-frames:v', '1', '-q:v', '2', '-vf', 'scale=640:-1', outputPath
      ]);
      console.log(`[VIDEO ${id}] SUCCESS`);
      await fsPromises.unlink(tempPath).catch(() => {});
      return true;
    } catch (e) {
      console.log(`[VIDEO ${id}] First frame failed`);
    }

    const timestamps = ['00:00:00.5', '00:00:01'];
    for (const ts of timestamps) {
      try {
        await execFileAsync('ffmpeg', [
          '-y', '-ss', ts, '-i', tempPath, '-frames:v', '1', '-q:v', '2', '-vf', 'scale=640:-1', outputPath
        ]);
        console.log(`[VIDEO ${id}] SUCCESS at ${ts}`);
        await fsPromises.unlink(tempPath).catch(() => {});
        return true;
      } catch (e) {
        console.log(`[VIDEO ${id}] Failed at ${ts}`);
      }
    }

    console.log(`[VIDEO ${id}] All attempts failed`);
    await fsPromises.unlink(tempPath).catch(() => {});
    return false;

  } catch (err) {
    console.log(`[VIDEO ${id}] Error: ${err.message}`);
    await fsPromises.unlink(tempPath).catch(() => {});
    return false;
  }
}

async function main() {
  await fsPromises.mkdir(THUMBNAILS_DIR, { recursive: true });

  let index = {};
  try {
    index = JSON.parse(await fsPromises.readFile(INDEX_PATH, 'utf8'));
  } catch (err) {
    console.error('Failed to read index.json');
    process.exit(1);
  }

  let processed = 0;
  let success = 0;

  for (const [id, item] of Object.entries(index)) {
    if (item.type !== 'video') continue;

    const dateStr = item.dateTaken ? item.dateTaken.substring(0, 10) : '';
    if (dateStr !== TARGET_DATE) continue;

    processed++;

    const thumbPath = `${THUMBNAILS_DIR}/${id}.jpg`;

    // Delete any existing thumbnail so we force regeneration
    await fsPromises.unlink(thumbPath).catch(() => {});

    let videoUrl = item.fullUrl;
    if (!videoUrl || !videoUrl.toLowerCase().includes('.mp4')) {
      const derivs = Object.values(item.derivatives || {});
      const mp4Deriv = derivs.find(d => d.url && d.url.toLowerCase().includes('.mp4'));
      if (mp4Deriv) videoUrl = mp4Deriv.url;
    }

    if (!videoUrl) {
      console.log(`[VIDEO ${id}] No video URL found`);
      continue;
    }

    console.log(`[VIDEO ${id}] Using URL: ${videoUrl.substring(0, 100)}...`);

    const ok = await extractThumbnail(videoUrl, thumbPath, id);

    if (ok) {
      index[id].thumbUrl = `./thumbnails/${id}.jpg`;
      success++;
    }
  }

  await fsPromises.writeFile(INDEX_PATH, JSON.stringify(index, null, 2));

  console.log(`\n=== Summary ===`);
  console.log(`Videos processed on ${TARGET_DATE}: ${processed}`);
  console.log(`Thumbnails generated: ${success}`);
  console.log(`index.json updated.`);
}

main().catch(err => console.error('Fatal error:', err));