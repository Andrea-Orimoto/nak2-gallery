import fs from 'fs';

const data = JSON.parse(fs.readFileSync('./index.json', 'utf8'));

const filenameMap = {};

for (const [id, item] of Object.entries(data)) {
  const fn = item.filename || '';
  if (!fn) continue;
  
  if (!filenameMap[fn]) filenameMap[fn] = [];
  filenameMap[fn].push(id);
}

console.log("=== Duplicates by filename ===\n");

let totalDupes = 0;

for (const [filename, guids] of Object.entries(filenameMap)) {
  if (guids.length > 1) {
    console.log(`\n${filename} (${guids.length} entries):`);
    guids.forEach(g => console.log(`   ${g}`));
    totalDupes += guids.length - 1;
  }
}

console.log(`\nTotal duplicate entries found: ${totalDupes}`);