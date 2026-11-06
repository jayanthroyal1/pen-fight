/**
 * Puts the converted fighters in Cloudflare R2, and writes the manifest link to
 * .env.local for the game to load them with. The model files can't go in the
 * public repo. They sit under a long random folder name and the bucket can't be
 * listed, so they're unlisted: a browser that plays the game still receives them.
 *
 * Sign in once with `npx wrangler@4 login`, then run: node scripts/upload-fighters.mjs
 */
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BUCKET = 'wildplayers-fighters';
const DIR = 'public/fighters';
const ENV_FILE = '.env.local';
const MANIFEST_VAR = 'VITE_FIGHTERS_MANIFEST_URL';
const PREFIX_VAR = 'R2_FIGHTERS_PREFIX';

const wrangler = (args, quiet = true) => execSync(`npx --yes wrangler@4 ${args}`, { encoding: 'utf8', stdio: quiet ? 'pipe' : 'inherit' });

const envLines = () => (existsSync(ENV_FILE) ? readFileSync(ENV_FILE, 'utf8').split(/\r?\n/).filter(Boolean) : []);
const readVar = (name) => envLines().find((l) => l.startsWith(`${name}=`))?.slice(name.length + 1);
const writeVar = (name, value) => writeFileSync(ENV_FILE, `${[...envLines().filter((l) => !l.startsWith(`${name}=`)), `${name}=${value}`].join('\n')}\n`);

function ensureBucket() {
  try {
    wrangler(`r2 bucket create ${BUCKET}`);
    console.log('bucket created');
  } catch (e) {
    if (!/already exists|10004/i.test(`${e.stdout}${e.stderr}`)) throw e;
    console.log('bucket already there');
  }
}

function publicUrl() {
  wrangler(`r2 bucket dev-url enable ${BUCKET} --force`);
  const url = wrangler(`r2 bucket dev-url get ${BUCKET}`).match(/https:\/\/[a-z0-9.-]+\.r2\.dev/i)?.[0];
  if (!url) throw new Error('Could not read the bucket’s public address.');
  return url;
}

function allowBrowsers() {
  const file = join(mkdtempSync(join(tmpdir(), 'r2-')), 'cors.json');
  writeFileSync(file, JSON.stringify({ rules: [{ allowed: { origins: ['*'], methods: ['GET', 'HEAD'] }, maxAgeSeconds: 86400 }] }));
  wrangler(`r2 bucket cors set ${BUCKET} --file "${file}" --force`);
}

function put(key, file, type) {
  wrangler(`r2 object put "${BUCKET}/${key}" --file "${file}" --content-type ${type} --cache-control "public, max-age=604800" --remote`);
}

const local = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8'));
ensureBucket();
const base = publicUrl();
allowBrowsers();

const prefix = readVar(PREFIX_VAR) ?? randomBytes(24).toString('hex');
writeVar(PREFIX_VAR, prefix);

const hosted = { fighters: {}, clips: {} };
for (const kind of ['fighters', 'clips']) {
  for (const [id, file] of Object.entries(local[kind])) {
    put(`${prefix}/${file}`, join(DIR, file), 'model/gltf-binary');
    hosted[kind][id] = `${base}/${prefix}/${file}`;
    console.log(`uploaded ${file}`);
  }
}

const manifestFile = join(mkdtempSync(join(tmpdir(), 'r2-')), 'manifest.json');
writeFileSync(manifestFile, JSON.stringify(hosted));
put(`${prefix}/manifest.json`, manifestFile, 'application/json');
const link = `${base}/${prefix}/manifest.json`;
writeVar(MANIFEST_VAR, link);

// Prove it from the outside: the files load, and the bucket can't be listed.
const check = await fetch(link);
const listing = await fetch(`${base}/`);
const model = await fetch(Object.values(hosted.fighters)[0], { method: 'HEAD' });
console.log(`\nmanifest ${check.status}, model ${model.status}, CORS ${(await fetch(link, { headers: { Origin: 'https://example.com' } })).headers.get('access-control-allow-origin')}, bucket root ${listing.status}`);
console.log(`${MANIFEST_VAR} is in ${ENV_FILE}. Add the same name and value to Vercel to use it on the live site.`);
