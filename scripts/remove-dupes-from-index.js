import fs from 'fs';
import fsPromises from 'fs/promises';

const INDEX_PATH = './index.json';

async function main() {
  console.log('Loading index.json...');

  const data = JSON.parse(await fsPromises.readFile(INDEX_PATH, 'utf8'));
  const originalCount = Object.keys(data).length;

  const seenFilenames = new Set();
  const cleanedIndex = {};

  let removed = 0;

  for (const [id, item] of Object.entries(data)) {
    const filename = item.filename || '';

    if (!filename) {
      // Keep items without filename (rare, but safe)
      cleanedIndex[id] = item;
      continue;
    }

    if (seenFilenames.has(filename)) {
      console.log(`Removing duplicate: ${filename} (${id})`);
      removed++;
      continue;
    }

    // Keep this one
    seenFilenames.add(filename);
    cleanedIndex[id] = item;
  }

  // Write cleaned index
  await fsPromises.writeFile(INDEX_PATH, JSON.stringify(cleanedIndex, null, 2));

  console.log('\n=== Duplicate Removal Complete ===');
  console.log(`Original items : ${originalCount}`);
  console.log(`Removed dupes  : ${removed}`);
  console.log(`Remaining items: ${Object.keys(cleanedIndex).length}`);
  console.log(`index.json has been updated.`);
}

main().catch(err => {
  console.error('Error:', err);
});