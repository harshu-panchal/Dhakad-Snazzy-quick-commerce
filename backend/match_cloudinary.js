const fs = require('fs');
const path = require('path');

const CLOUD_ROOT = path.join(__dirname, 'cloudinary_backup', 'cloudinary');
function readJsonStripBom(p) {
  let s = fs.readFileSync(p, 'utf8');
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  return JSON.parse(s);
}
const index = readJsonStripBom(path.join(CLOUD_ROOT, 'index.json'));
const broken = readJsonStripBom(path.join(__dirname, 'broken_images.json'));

function slugify(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// index by exact basename (no extension)
const byFilename = new Map();
// index by folder path (all but last segment of public_id), collecting files in that folder
const byFolder = new Map();

for (const rec of index) {
  const parts = rec.public_id.split('/');
  const base = parts[parts.length - 1];
  if (!byFilename.has(base)) byFilename.set(base, []);
  byFilename.get(base).push(rec);

  const folder = parts.slice(0, -1).join('/');
  if (!byFolder.has(folder)) byFolder.set(folder, []);
  byFolder.get(folder).push(rec);
}

// build a slug -> [folder paths] index for every folder segment that looks like a product slug
const slugToFolders = new Map();
for (const folder of byFolder.keys()) {
  const segs = folder.split('/');
  const lastSeg = segs[segs.length - 1];
  if (!lastSeg) continue;
  if (!slugToFolders.has(lastSeg)) slugToFolders.set(lastSeg, []);
  slugToFolders.get(lastSeg).push(folder);
}

function urlFilenameNoExt(url) {
  const base = url.split('/').pop() || '';
  return base.replace(/\.[a-zA-Z0-9]+$/, '');
}

const results = { exact: [], slugFolder: [], none: [] };

for (const item of broken) {
  const fname = urlFilenameNoExt(item.url);
  const exactMatches = byFilename.get(fname);
  if (exactMatches && exactMatches.length > 0) {
    results.exact.push({ ...item, candidates: exactMatches.map(r => ({ public_id: r.public_id, format: r.format, local_path: r.local_path, width: r.width, height: r.height })) });
    continue;
  }

  const slug = slugify(item.name);
  const folders = slugToFolders.get(slug);
  if (folders && folders.length > 0) {
    const files = folders.flatMap(f => byFolder.get(f));
    results.slugFolder.push({ ...item, candidates: files.map(r => ({ public_id: r.public_id, format: r.format, local_path: r.local_path, width: r.width, height: r.height })) });
    continue;
  }

  results.none.push(item);
}

// Fuzzy fallback: word-overlap scoring against every product-style folder (2+ words)
const nameWords = (s) => new Set(slugify(s).split('-').filter(w => w.length > 2));
const allFolders = [...slugToFolders.keys()].filter(s => s.split('-').length >= 2);
const folderWordSets = allFolders.map(f => ({ folder: f, words: new Set(f.split('-').filter(w => w.length > 2)) }));

results.fuzzy = [];
for (const item of results.none.slice()) {
  const iw = nameWords(item.name);
  if (iw.size === 0) continue;
  let best = null, bestScore = 0;
  for (const { folder, words } of folderWordSets) {
    let overlap = 0;
    for (const w of iw) if (words.has(w)) overlap++;
    const score = overlap / Math.max(iw.size, words.size);
    if (score > bestScore) { bestScore = score; best = folder; }
  }
  if (best && bestScore >= 0.6) {
    const folderPaths = slugToFolders.get(best);
    const files = folderPaths.flatMap(f => byFolder.get(f));
    results.fuzzy.push({ ...item, matchedFolder: best, score: bestScore, candidates: files.map(r => ({ public_id: r.public_id, format: r.format, local_path: r.local_path, width: r.width, height: r.height })) });
  }
}
console.log('FUZZY folder matches (score>=0.6):', results.fuzzy.length);
results.none = results.none.filter(item => !results.fuzzy.some(f => f.id === item.id && f.field === item.field));

console.log('EXACT filename matches:', results.exact.length);
console.log('SLUG folder matches:', results.slugFolder.length);
console.log('NO match found:', results.none.length);

fs.writeFileSync(path.join(__dirname, 'cloudinary_match_results.json'), JSON.stringify(results, null, 2));
console.log('Written to cloudinary_match_results.json');
