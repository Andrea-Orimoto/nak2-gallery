import { getImages } from 'icloud-shared-album';
import fs from 'fs/promises';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const TOKEN = 'B1uG6XBubuvcunC';
const INDEX_PATH = './index.json';
const THUMBNAILS_DIR = './thumbnails';
const TEMP_DIR = './temp';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log('Fetching iCloud shared album...');

  await fs.mkdir(THUMBNAILS_DIR, { recursive: true });
  await fs.mkdir(TEMP_DIR, { recursive: true }).catch(() => {});

  const data = await getImages(TOKEN);
  console.log(`Total items returned by API: ${data.photos?.length || 0}`);

  const newIndex = {};
  let generated = 0;
  let skipped = 0;
  let failed = 0;
  let shortVideos = 0;

  for (const item of data.photos || []) {
    const id = item.photoGuid || item.checksum || item.id || Math.random().toString(36).slice(2);

    const derivatives = item.derivatives || {};
    const derivValues = Object.values(derivatives);

    const isVideo = item.mediaAssetType === 'video' ||
      derivValues.some(d => d.url && (d.url.endsWith('.mp4') || d.url.endsWith('.mov')));

    const type = isVideo ? 'video' : 'image';

    let thumbUrl = '';
    let fullUrl = '';

    if (isVideo) {
      const videoUrl = derivValues.find(d => d.url && d.url.endsWith('.mp4'))?.url || derivValues[0]?.url;

      if (videoUrl) {
        fullUrl = videoUrl;
        const thumbFilename = `${id}.jpg`;
        const thumbPath = `${THUMBNAILS_DIR}/${thumbFilename}`;

        const exists = await fs.access(thumbPath).then(() => true).catch(() => false);

        if (exists) {
          thumbUrl = `./thumbnails/${thumbFilename}`;
          skipped++;
        } else {
          console.log(`Generating thumbnail for video ${id}...`);

          const tempVideoPath = `${TEMP_DIR}/${id}.mp4`;

          try {
            // Download
            console.log(`  Downloading...`);
            const response = await fetch(videoUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const buffer = await response.arrayBuffer();
            await fs.writeFile(tempVideoPath, Buffer.from(buffer));
            console.log(`  Download complete`);

            // Smart timestamp: try 0s first for short videos, then 1s or 2s
            const timestamps = ['00:00:00.0', '00:00:01.0', '00:00:02.0'];

            let success = false;
            for (const ts of timestamps) {
              if (success) break;

              console.log(`  Trying frame at ${ts}...`);
              try {
                await new Promise((resolve, reject) => {
                  ffmpeg(tempVideoPath)
                    .screenshots({
                      timestamps: [ts],
                      filename: thumbFilename,
                      folder: THUMBNAILS_DIR,
                      size: '640x360'
                    })
                    .on('end', () => resolve())
                    .on('error', (err) => reject(err));
                });

                await sleep(1000);

                const fileExists = await fs.access(thumbPath).then(() => true).catch(() => false);
                if (fileExists) {
                  thumbUrl = `./thumbnails/${thumbFilename}`;
                  generated++;
                  console.log(`✅ Success at ${ts} for ${id}`);
                  success = true;
                }
              } catch (e) {
                console.log(`  Failed at ${ts}`);
              }
            }

            if (!success) {
              console.log(`  All timestamps failed → using placeholder`);
              thumbUrl = 'https://via.placeholder.com/640x360/1f2937/9ca3af?text=🎬';
              shortVideos++;
              failed++;
            }
          } catch (err) {
            console.error(`⚠ Failed for ${id}: ${err.message}`);
            thumbUrl = 'https://via.placeholder.com/640x360/1f2937/9ca3af?text=🎬';
            failed++;
          } finally {
            await fs.unlink(tempVideoPath).catch(() => {});
          }
        }
      }
    } else {
      const sorted = [...derivValues].sort((a, b) => (b.width || 0) - (a.width || 0));
      const thumb = derivValues.find(d => (d.width || 0) >= 300 && (d.width || 0) <= 800) || derivValues[0];
      const full = sorted[0] || thumb;

      thumbUrl = thumb?.url || '';
      fullUrl = full?.url || '';
    }

    newIndex[id] = {
      id,
      type,
      dateTaken: item.assetDate || item.creationDate || item.originalDate || item.dateCreated || item.dateAdded || new Date().toISOString(),
      caption: item.caption || '',
      thumbUrl,
      fullUrl: fullUrl || thumbUrl,
      width: 0,
      height: 0,
      derivatives: derivatives
    };
  }

  await fs.writeFile(INDEX_PATH, JSON.stringify(newIndex, null, 2));

  console.log(`\n✅ Updated index.json with ${Object.keys(newIndex).length} items`);
  console.log(`   Videos: ${Object.values(newIndex).filter(i => i.type === 'video').length}`);
  console.log(`   Thumbnails generated: ${generated}`);
  console.log(`   Thumbnails skipped: ${skipped}`);
  console.log(`   Short/zero-second videos (placeholder): ${shortVideos}`);
  console.log(`   Failed: ${failed}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
});