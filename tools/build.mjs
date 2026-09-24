/**
 * 构建：把百度 appid / 密钥用「口令」加密后内联进 docs/index.html。
 *
 *   node tools/build.mjs            # 构建（缺失 secrets.local.json 时自动生成口令）
 *   node tools/build.mjs --show     # 只打印口令与 MarginNote 用的 URL
 *
 * secrets.local.json 已被 .gitignore 忽略，绝不进仓库；仓库里只有密文。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SECRETS = path.join(ROOT, 'secrets.local.json');
const TEMPLATE = path.join(ROOT, 'src', 'index.template.html');
const APPJS = path.join(ROOT, 'src', 'app.js');
const OUTDIR = path.join(ROOT, 'docs');
const OUT = path.join(OUTDIR, 'index.html');

const OWNER = 'night-system';
const REPO = 'mn-translate';
const SITE = `https://${OWNER}.github.io/${REPO}/`;

const ITER = 200000;
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

function newPassphrase(len = 16) {
  const bytes = crypto.randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return s;
}

function encrypt(payload, passphrase) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(Buffer.from(passphrase, 'utf8'), salt, ITER, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();          // WebCrypto 的 AES-GCM 密文尾随 16 字节 tag
  return {
    v: 1,
    iter: ITER,
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    ct: Buffer.concat([ct, tag]).toString('base64'),
  };
}

function loadSecrets() {
  if (fs.existsSync(SECRETS)) {
    const j = JSON.parse(fs.readFileSync(SECRETS, 'utf8'));
    if (!j.appid || !j.key) throw new Error('secrets.local.json 缺少 appid / key');
    if (!j.passphrase) { j.passphrase = newPassphrase(); fs.writeFileSync(SECRETS, JSON.stringify(j, null, 2)); }
    return j;
  }
  const j = {
    _说明: '本地私密文件，已在 .gitignore 中忽略，不会提交到仓库。改密钥或口令后重新跑 node tools/build.mjs 并推送 docs/ 即可。',
    appid: 'PUT_YOUR_APPID_HERE',
    key: 'PUT_YOUR_SECRET_KEY_HERE',
    passphrase: newPassphrase(),
  };
  fs.writeFileSync(SECRETS, JSON.stringify(j, null, 2), 'utf8');
  console.log(`\n⚠️  已生成 ${path.relative(ROOT, SECRETS)}，请填入 appid / key 后重新运行。\n`);
  process.exit(2);
}

const secrets = loadSecrets();

if (process.argv.includes('--show')) {
  console.log('口令：', secrets.passphrase);
  console.log('MN URL：', `${SITE}?p=${secrets.passphrase}&q={keyword}`);
  process.exit(0);
}

const blob = encrypt({ appid: secrets.appid, key: secrets.key }, secrets.passphrase);

let html = fs.readFileSync(TEMPLATE, 'utf8');
const app = fs.readFileSync(APPJS, 'utf8');

if (!html.includes('/*__APP_JS__*/')) throw new Error('模板缺少 /*__APP_JS__*/ 占位符');
if (!app.includes('__CRED_BLOB__')) throw new Error('app.js 缺少 __CRED_BLOB__ 占位符');

const appInjected = app.replace('__CRED_BLOB__', JSON.stringify(blob));
html = html.replace('/*__APP_JS__*/', () => appInjected);

fs.mkdirSync(OUTDIR, { recursive: true });
fs.writeFileSync(OUT, html, 'utf8');
// GitHub Pages 对未匹配路径返回 404.html，这里放一份同样的页面，
// 使 /mn-translate/<文本> 这种「路径式」URL 也能正常翻译（SPA 兜底技巧）。
fs.writeFileSync(path.join(OUTDIR, '404.html'), html, 'utf8');
fs.writeFileSync(path.join(OUTDIR, '.nojekyll'), '');
fs.writeFileSync(path.join(OUTDIR, 'robots.txt'), 'User-agent: *\nDisallow: /\n');

const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
console.log(`\n✅ 构建完成  docs/index.html  (${kb} KB)`);
console.log(`   appid   : ${secrets.appid}`);
console.log(`   密钥    : ${secrets.key.slice(0, 4)}……${secrets.key.slice(-2)}（已加密进页面）`);
console.log(`   口令    : ${secrets.passphrase}`);
console.log(`\n   MarginNote 自定义 URL：`);
console.log(`   ${SITE}?p=${secrets.passphrase}&q={keyword}\n`);
