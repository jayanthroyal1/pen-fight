/**
 * Turns Mixamo's FBX downloads into the GLB files the game loads.
 *
 *   assets-incoming/characters/<fighter id>.fbx   for example aren.fbx, zarok.fbx
 *   assets-incoming/animations/*.fbx              any names: sorted by the words in them
 *
 * Run with: node scripts/convert-fighters.mjs
 * Writes public/fighters/ and a manifest the game reads.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { slotFor } from './clipSlots.mjs';

const IN = 'assets-incoming';
const OUT = 'public/fighters';
const TOOL = join('node_modules', 'fbx2gltf', 'bin', 'Windows_NT', 'FBX2glTF.exe');

const fbx = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.fbx')) : []);

const TEXTURE_SIZE = '1024';
const transform = (...args) => execFileSync(process.execPath, [join('node_modules', '@gltf-transform', 'cli', 'bin', 'cli.js'), ...args], { stdio: 'pipe' });

function convert(from, to) {
  execFileSync(TOOL, ['--binary', '--input', from, '--output', to], { stdio: 'pipe' });
  return `${to}.glb`;
}

/** Shrinks a character's textures, which are most of its size. The mesh and skeleton aren't touched. */
function shrink(file) {
  transform('resize', file, file, '--width', TEXTURE_SIZE, '--height', TEXTURE_SIZE);
  transform('webp', file, file, '--quality', '80');
}

mkdirSync(join(OUT, 'clips'), { recursive: true });

const fighters = {};
for (const file of fbx(join(IN, 'characters'))) {
  const id = basename(file, '.fbx').toLowerCase();
  const out = convert(join(IN, 'characters', file), join(OUT, id));
  shrink(out);
  fighters[id] = `${id}.glb`;
  console.log(`fighter  ${id.padEnd(10)} ${(statSync(out).size / 1048576).toFixed(1)} MB`);
}

const clips = {};
const skipped = [];
for (const file of fbx(join(IN, 'animations'))) {
  const slot = slotFor(file);
  if (!slot) {
    skipped.push(file);
    continue;
  }
  if (clips[slot]) continue;
  const out = convert(join(IN, 'animations', file), join(OUT, 'clips', slot));
  clips[slot] = `clips/${slot}.glb`;
  console.log(`clip     ${slot.padEnd(10)} ${file} (${(statSync(out).size / 1024).toFixed(0)} KB)`);
}

writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify({ fighters, clips }, null, 2)}\n`);
console.log(`\n${Object.keys(fighters).length} fighters, ${Object.keys(clips).length} clips.`);
if (skipped.length) console.log(`Not matched to a move: ${skipped.join(', ')}`);
