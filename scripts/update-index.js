import { getImages } from 'icloud-shared-album';
import fs from 'fs/promises';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const TOKEN = 'B1uG6XBubuvcunC';
const INDEX_PATH = './index.json';
const THUMBNAILS_DIR = './thumbnails';

async function main() {
  console.log('Fetching iCloud shared album...');

  // Create thumbnails directory
  await fs.mkdir(THUMBNAILS_DIR, { recursive: true });

  const data = await getImages(TOKEN);
  console.log(`Total items returned by API: ${data.photos?.length || 0}`);

  const newIndex = {};
  let generatedCount = 0;
  let skippedCount = 0;

  for (const item of data.photos || []) {
    const id = item.photoGuid || item.checksum || item.id || Math.random().toString(36).slice(2);

    const derivatives = item.derivatives || {};
    const derivValues = Object.values(derivatives);

    const isVideo = 
      item.mediaAssetType === 'video' ||
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

        // Check if thumbnail already exists
        const thumbnailExists = await fs.access(thumbPath).then(() => true).catch(() => false);

        if (thumbnailExists) {
          thumbUrl = `./thumbnails/${thumbFilename}`;
          skippedCount++;
        } else {
          // Generate new thumbnail
          try {
            await new Promise((resolve, reject) => {
              ffmpeg(videoUrl)
                .screenshots({
                  timestamps: ['00:00:01.0'],   // Extract frame at 1 second
                  filename: thumbFilename,
                  folder: THUMBNAILS_DIR,
                  size: '640x360'
                })
                .on('end', resolve)
                .on('error', reject);
            });

            thumbUrl = `./thumbnails/${thumbFilename}`;
            generatedCount++;
            console.log(`✓ Generated thumbnail for video ${id}`);
          } catch (err) {
            console.log(`⚠ Failed to generate thumbnail for ${id}`);
            thumbUrl = 'https://via.placeholder.com/640x360/374151/9CA3AF?text=Video';
          }
        }
      }
    } else {
      // Photo logic
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
      thumbUrl: thumbUrl,
      fullUrl: fullUrl,
      width: 0,
      height: 0,
      derivatives: derivatives
    };
  }

  await fs.writeFile(INDEX_PATH, JSON.stringify(newIndex, null, 2));
  
  const videoCount = Object.values(newIndex).filter(i => i.type === 'video').length;
  
  console.log(`✅ Updated index.json with ${Object.keys(newIndex).length} items`);
  console.log(`   Videos detected: ${videoCount}`);
  console.log(`   Thumbnails generated: ${generatedCount}`);
  console.log(`   Thumbnails skipped (already existed): ${skippedCount}`);
}

main().catch(err => {
  console.error('Error updating index:', err);
});