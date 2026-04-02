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
  let zeroSecondVideos = 0;

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

          // Quick check: if file size is tiny, it's likely a 0-second video
          try {
            const response = await fetch(videoUrl, { method: 'HEAD' });
            const contentLength = parseInt(response.headers.get('content-length') || '0');

            if (contentLength < 50000) {  // less than ~50KB → very likely 0s video
              console.log(`  → Detected 0-second / tiny video (${contentLength} bytes), using placeholder`);
              thumbUrl = 'https://via.placeholder.com/640x360/1f2937/9ca3af?text=🎬';
              zeroSecondVideos++;
              failed++; // count as failed for stats
            } else {
              // Normal video - try to generate thumbnail
              const tempVideoPath = `${TEMP_DIR}/${id}.mp4`;

              try {
                console.log(`  Downloading video...`);
                const fullResponse = await fetch(videoUrl);
                const buffer = await fullResponse.arrayBuffer();
                await fs.writeFile(tempVideoPath, Buffer.from(buffer));

                console.log(`  Extracting frame...`);
                await new Promise((resolve, reject) => {
                  ffmpeg(tempVideoPath)
                    .screenshots({
                      timestamps: ['00:00:01.0'],
                      filename: thumbFilename,
                      folder: THUMBNAILS_DIR,
                      size: '640x360'
                    })
                    .on('end', () => resolve())
                    .on('error', (err) => reject(err));
                });

                await sleep(1200);

                const fileExists = await fs.access(thumbPath).then(() => true).catch(() => false);
                if (fileExists) {
                  thumbUrl = `./thumbnails/${thumbFilename}`;
                  generated++;
                  console.log(`✅ Thumbnail saved for ${id}`);
                } else {
                  throw new Error('File not created');
                }
              } catch (err) {
                console.error(`⚠ Failed for ${id}: ${err.message}`);
                thumbUrl = 'https://via.placeholder.com/640x360/1f2937/9ca3af?text=🎬';
                failed++;
              } finally {
                await fs.unlink(tempVideoPath).catch(() => {});
              }
            }
          } catch (e) {
            // If HEAD request fails, fall back to placeholder
            thumbUrl = 'https://via.placeholder.com/640x360/1f2937/9ca3af?text=🎬';
            failed++;
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
  console.log(`   Zero-second / tiny videos: ${zeroSecondVideos}`);
  console.log(`   Thumbnails failed: ${failed}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
});