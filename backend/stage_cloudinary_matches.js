const fs = require('fs');
const path = require('path');

function readJsonStripBom(p) {
  let s = fs.readFileSync(p, 'utf8');
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  return JSON.parse(s);
}

const CLOUD_ROOT = path.join(__dirname, 'cloudinary_backup', 'cloudinary');
const STAGE_DIR = path.join(__dirname, 'cloudinary_staged');
fs.mkdirSync(STAGE_DIR, { recursive: true });

const results = readJsonStripBom(path.join(__dirname, 'cloudinary_match_results.json'));

const manifest = [];
let counter = 0;
const usedNames = new Set();

for (const item of results.exact) {
  const cand = item.candidates[0];
  const srcPath = path.join(CLOUD_ROOT, cand.public_id.split('/').join(path.sep) + '.' + cand.format);
  if (!fs.existsSync(srcPath)) {
    console.log('MISSING SOURCE FILE, skipping:', srcPath);
    continue;
  }
  counter++;
  let base = cand.public_id.split('/').pop();
  let outName = `${base}.${cand.format}`;
  let n = 1;
  while (usedNames.has(outName)) {
    outName = `${base}_${n}.${cand.format}`;
    n++;
  }
  usedNames.add(outName);

  const destPath = path.join(STAGE_DIR, outName);
  fs.copyFileSync(srcPath, destPath);

  manifest.push({
    collection: item.collection,
    id: item.id,
    field: item.field,
    name: item.name,
    stagedFile: outName,
  });
}

fs.writeFileSync(path.join(__dirname, 'cloudinary_manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Staged ${counter} files to cloudinary_staged/. Manifest written with ${manifest.length} entries.`);
