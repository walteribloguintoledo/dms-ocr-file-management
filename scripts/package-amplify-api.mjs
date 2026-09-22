import { mkdir, cp, writeFile, readFile, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'apps/api/.amplify-hosting');
const compute = resolve(output, 'compute/default');
const required = ['DATABASE_URL', 'JWT_SECRET', 'WEB_ORIGIN', 'S3_BUCKET', 'AWS_REGION'];
for (const name of required) if (!process.env[name]?.trim()) throw new Error(`Missing API build environment variable: ${name}`);
// Only this explicit allowlist is placed in the PRIVATE compute bundle.
// AWS access credentials must come from the Amplify compute IAM role.
const env = Object.fromEntries([...required, 'MAX_FILE_SIZE_MB'].filter(name => process.env[name]).map(name => [name, process.env[name]]));
await mkdir(compute, {recursive:true});
await mkdir(resolve(output, 'static'), {recursive:true});
await cp(resolve(root, 'apps/api/dist'), resolve(compute, 'dist'), {recursive:true});
const api = JSON.parse(await readFile(resolve(root, 'apps/api/package.json'), 'utf8'));
const require = createRequire(resolve(root, 'apps/api/package.json'));
const dependencies = {};
for (const name of [...Object.keys(api.dependencies), '@prisma/client', 'bcryptjs']) {
  dependencies[name] = require(`${name}/package.json`).version;
}
await writeFile(resolve(compute, 'package.json'), JSON.stringify({name:'folio360-api-compute',version:'1.0.0',private:true,dependencies},null,2));
execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install','--omit=dev','--ignore-scripts','--no-audit','--no-fund'], {cwd:compute,stdio:'inherit'});
await cp(resolve(root, 'node_modules/.prisma'), resolve(compute, 'node_modules/.prisma'), {recursive:true});
await writeFile(resolve(compute, 'runtime-config.json'), JSON.stringify(env), {mode:0o600});
await writeFile(resolve(compute, 'server.js'), `const config = require('./runtime-config.json');
for (const [key,value] of Object.entries(config)) process.env[key] = value;
process.env.NODE_ENV = 'production';
process.env.PORT = '3000';
process.env.HOST = '0.0.0.0';
require('./dist/main.js');
`);
await writeFile(resolve(output, 'deploy-manifest.json'), JSON.stringify({version:1,framework:{name:'express',version:require('express/package.json').version},routes:[{path:'/*',target:{kind:'Compute',src:'default'}}],computeResources:[{name:'default',runtime:'nodejs22.x',entrypoint:'server.js'}]},null,2));
await stat(resolve(compute,'dist/main.js'));
console.log('API compute bundle created. Runtime configuration is private; do not publish or commit the bundle.');
