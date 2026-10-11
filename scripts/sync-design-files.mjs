// Builds the Files page data from the CAD sources in design-files/.
//
// Why: CATIA, AutoCAD and OpenRocket files cannot be opened by a browser, so this script
// extracts what can be shown: the preview image CATIA/AutoCAD embed in every file, and
// the rocket geometry stored as XML inside OpenRocket .ork archives (rendered in 2D/3D).
// The source files themselves are never copied to public/.
//
// Usage: node scripts/sync-design-files.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import * as cheerio from 'cheerio';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(root, 'design-files');
const previewDir = path.join(root, 'public/assets/design-files');
const modelDir = path.join(sourceDir, 'models');
const manifestPath = path.join(root, 'src/data/design-files/manifest.json');

// High-resolution renders from the CATIA presentation that show the same part as a file.
const DESIGN_IMG = '/assets/images/designs/';
const HIRES = {
  'turbo jet.CATPart': ['catia-turbojet-engine'],
  'Part1.CATPart': ['catia-drone-design-2', 'catia-drone-side-view'],
  'new drone.CATProduct': ['catia-drone-side-view', 'catia-drone-design-2'],
  'final done delivery.CATProduct': ['catia-drone-design-2', 'catia-drone-side-view'],
  'CATIA DRONE DESIGN.CATPart': ['catia-drone-design-1'],
  'catia 12 full.CATProduct': ['catia-3d-support-frame'],
  'catia 4.CATPart': ['catia-3d-angle-bracket'],
  'catia 5.CATPart': ['catia-3d-pivot-bracket'],
  'catia 6.CATPart': ['catia-3d-shaft-support'],
  'catia 7.CATPart': ['catia-3d-connecting-lever'],
};

const DECK_IMAGES = [
  ['catia-2d-sketch-lever', '2D sketch: lever'],
  ['catia-2d-sketch-flange', '2D sketch: flange'],
  ['catia-3d-connecting-lever', '3D: connecting lever'],
  ['catia-3d-shaft-support', '3D: shaft support'],
  ['catia-3d-support-frame', '3D: support frame'],
  ['catia-3d-pivot-bracket', '3D: pivot bracket'],
  ['catia-3d-angle-bracket', '3D: angle bracket'],
  ['catia-drone-design-1', 'Drone design 1'],
  ['catia-drone-design-2', 'Drone design 2'],
  ['catia-drone-side-view', 'Drone side view'],
  ['catia-turbojet-engine', 'Turbojet engine'],
];

// Listed so the page shows every file the owner has, but never published.
const RESTRICTED = [
  {
    name: '3 rd review ppt.pptx',
    note: 'SATCOM radome review carried out under CABS, DRDO. The results are restricted and confidential, so this file is not published.',
  },
];

const TYPES = {
  '.catpart': { group: 'CATIA parts', kind: 'CATIA Part', icon: 'cube', view: '3d' },
  '.catproduct': { group: 'CATIA assemblies', kind: 'CATIA Product (assembly)', icon: 'cube-focus', view: '3d' },
  '.dwg': { group: 'AutoCAD drawings', kind: 'AutoCAD Drawing', icon: 'compass-tool', view: '2d' },
  '.ork': { group: 'OpenRocket designs', kind: 'OpenRocket Design', icon: 'rocket-launch', view: 'both' },
  '.pptx': { group: 'Presentations', kind: 'PowerPoint Presentation', icon: 'presentation-chart', view: '2d' },
};
const GROUP_ORDER = ['OpenRocket designs', 'CATIA assemblies', 'CATIA parts', 'AutoCAD drawings', 'Presentations'];

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'models' ? [] : walk(full);
    return [full];
  });
}

// Minimal ZIP reader (central directory + inflateRaw) for .ork archives.
function readZipEntry(buffer, wanted) {
  const eocd = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  let ptr = buffer.readUInt32LE(eocd + 16);
  const count = buffer.readUInt16LE(eocd + 10);
  for (let i = 0; i < count; i += 1) {
    const method = buffer.readUInt16LE(ptr + 10);
    const compSize = buffer.readUInt32LE(ptr + 20);
    const nameLen = buffer.readUInt16LE(ptr + 28);
    const extraLen = buffer.readUInt16LE(ptr + 30);
    const commentLen = buffer.readUInt16LE(ptr + 32);
    const localOffset = buffer.readUInt32LE(ptr + 42);
    const name = buffer.toString('utf8', ptr + 46, ptr + 46 + nameLen);
    if (name === wanted) {
      const dataStart = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
      const raw = buffer.subarray(dataStart, dataStart + compSize);
      return method === 0 ? raw : zlib.inflateRawSync(raw);
    }
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return undefined;
}

function embeddedJpeg(buffer) {
  const start = buffer.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
  if (start < 0) return undefined;
  let i = start + 2;
  while (i < buffer.length && buffer[i] === 0xff) {
    const marker = buffer[i + 1];
    if (marker === 0xda) {
      const end = buffer.indexOf(Buffer.from([0xff, 0xd9]), i);
      return end > 0 ? buffer.subarray(start, end + 2) : undefined;
    }
    i += 2 + buffer.readUInt16BE(i + 2);
  }
  return undefined;
}

function embeddedPng(buffer) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  let best;
  for (let i = buffer.indexOf(sig); i >= 0; i = buffer.indexOf(sig, i + 1)) {
    const end = buffer.indexOf(Buffer.from('IEND'), i);
    if (end > 0 && (!best || end + 8 - i > best.length)) best = buffer.subarray(i, end + 8);
  }
  return best;
}

const num = (text) => {
  const match = String(text ?? '').match(/-?\d+(\.\d+)?(E-?\d+)?/i);
  return match ? Number(match[0]) : 0;
};
const round = (value) => Math.round(value * 1e5) / 1e5;

// Turns rocket.ork XML into an axial list of segments (x along the body, metres) and fin sets.
function parseRocket(xml) {
  const $ = cheerio.load(xml, { xml: true });
  const rocket = $('openrocket > rocket').first();
  const segments = [];
  const fins = [];
  const stages = [];
  let x = 0;
  let lastRadius = 0;

  rocket.children('subcomponents').children('stage').each((_, stageEl) => {
    const stage = $(stageEl);
    const stageStart = x;
    stage.children('subcomponents').children().each((__, compEl) => {
      const comp = $(compEl);
      const tag = compEl.tagName;
      const length = num(comp.children('length').text());
      if (tag === 'nosecone') {
        const radius = num(comp.children('aftradius').text());
        segments.push({ type: 'nose', x: round(x), length: round(length), r0: 0, r1: round(radius), shape: comp.children('shape').text() || 'ogive', param: num(comp.children('shapeparameter').text()) });
        lastRadius = radius;
      } else if (tag === 'bodytube') {
        const radiusText = comp.children('radius').text();
        const radius = radiusText ? num(radiusText) : lastRadius;
        segments.push({ type: 'tube', x: round(x), length: round(length), r0: round(radius), r1: round(radius) });
        lastRadius = radius;
        comp.children('subcomponents').children('trapezoidfinset').each((___, finEl) => {
          const fin = $(finEl);
          const rootChord = num(fin.children('rootchord').text());
          const position = fin.children('position');
          const offset = num(position.text());
          const type = position.attr('type') ?? 'top';
          const finX = type === 'bottom' ? x + length - rootChord + offset
            : type === 'middle' ? x + (length - rootChord) / 2 + offset
            : type === 'absolute' ? offset
            : x + offset;
          fins.push({
            x: round(finX),
            count: num(fin.children('fincount').text()) || 3,
            root: round(rootChord),
            tip: round(num(fin.children('tipchord').text())),
            span: round(num(fin.children('height').text())),
            sweep: round(num(fin.children('sweeplength').text())),
            thickness: round(num(fin.children('thickness').text()) || 0.003),
            radius: round(radius),
          });
        });
      } else if (tag === 'transition') {
        const r0 = num(comp.children('foreradius').text()) || lastRadius;
        const r1 = num(comp.children('aftradius').text()) || lastRadius;
        segments.push({ type: 'transition', x: round(x), length: round(length), r0: round(r0), r1: round(r1), shape: comp.children('shape').text() || 'conical' });
        lastRadius = r1;
      } else {
        return;
      }
      x += length;
    });
    stages.push({ name: stage.children('name').text(), start: round(stageStart), end: round(x) });
  });

  const motor = rocket.find('motormount motor').first();
  const maxRadius = Math.max(...segments.map((s) => Math.max(s.r0, s.r1)), 0);
  return {
    name: rocket.children('name').text(),
    length: round(x),
    diameter: round(maxRadius * 2),
    noseShape: segments.find((s) => s.type === 'nose')?.shape,
    finCount: fins.reduce((sum, fin) => sum + fin.count, 0),
    motor: motor.length ? `${motor.children('manufacturer').text()} ${motor.children('designation').text()}`.trim() : undefined,
    stages,
    segments,
    fins,
  };
}

async function writePreview(buffer, name, scale) {
  const out = path.join(previewDir, `${name}.webp`);
  const meta = await sharp(buffer).metadata();
  await sharp(buffer).resize({ width: Math.round(meta.width * scale), kernel: 'lanczos3' }).webp({ quality: 88 }).toFile(out);
  return `/assets/design-files/${name}.webp`;
}

// design-files/ is git-ignored, so a fresh clone keeps the committed manifest and previews.
if (!fs.existsSync(sourceDir)) {
  console.log('design-files: no design-files/ folder, keeping the existing manifest.');
  process.exit(0);
}

fs.rmSync(previewDir, { recursive: true, force: true });
fs.mkdirSync(previewDir, { recursive: true });
fs.mkdirSync(path.dirname(manifestPath), { recursive: true });

const usedIds = new Set();
const files = [];
for (const full of walk(sourceDir).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))) {
  const name = path.basename(full);
  const ext = path.extname(name).toLowerCase();
  const type = TYPES[ext];
  if (!type) continue;

  let id = slugify(name);
  for (let n = 2; usedIds.has(id); n += 1) id = `${slugify(name)}-${n}`;
  usedIds.add(id);

  const buffer = fs.readFileSync(full);
  const entry = { id, name, ext: ext.slice(1).toUpperCase(), group: type.group, kind: type.kind, icon: type.icon, view: type.view, size: buffer.length, images: [] };

  if (ext === '.catpart' || ext === '.catproduct') {
    const jpeg = embeddedJpeg(buffer);
    if (jpeg) entry.thumbnail = await writePreview(jpeg, id, 1);
    entry.images = (HIRES[name] ?? []).map((img) => ({ src: `${DESIGN_IMG}${img}.webp`, caption: 'Rendered in CATIA' }));
    if (!entry.images.length && jpeg) entry.images = [{ src: await writePreview(jpeg, `${id}-large`, 4), caption: 'Preview embedded in the CATIA file' }];
    const stl = path.join(modelDir, `${path.parse(name).name}.stl`);
    if (fs.existsSync(stl)) {
      fs.copyFileSync(stl, path.join(previewDir, `${id}.stl`));
      entry.model = `/assets/design-files/${id}.stl`;
    }
  } else if (ext === '.dwg') {
    const png = embeddedPng(buffer);
    if (png) {
      const meta = await sharp(png).metadata();
      const src = await writePreview(png, id, meta.width < 400 ? 2 : 1);
      entry.thumbnail = src;
      entry.images = [{ src, caption: 'Drawing preview embedded in the DWG file' }];
    }
  } else if (ext === '.ork') {
    const xml = readZipEntry(buffer, 'rocket.ork');
    if (xml) entry.rocket = parseRocket(xml.toString('utf8'));
  } else if (ext === '.pptx') {
    entry.images = DECK_IMAGES.map(([img, caption]) => ({ src: `${DESIGN_IMG}${img}.webp`, caption }));
    entry.thumbnail = `${DESIGN_IMG}catia-drone-design-2@480.webp`;
  }
  files.push(entry);
}

for (const item of RESTRICTED) {
  files.push({ id: slugify(item.name), name: item.name, ext: 'PPTX', group: 'Presentations', kind: 'PowerPoint Presentation', icon: 'lock-simple', view: 'none', restricted: true, note: item.note, images: [] });
}

files.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || a.name.localeCompare(b.name, 'en', { numeric: true }));
fs.writeFileSync(manifestPath, `${JSON.stringify({ groups: GROUP_ORDER, files }, null, 2)}\n`);
console.log(`design-files: ${files.length} files -> ${path.relative(root, manifestPath)}`);
