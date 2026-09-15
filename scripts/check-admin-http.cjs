const {spawn}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const assert=require('node:assert/strict');
const port=4019,origin='http://127.0.0.1:3000';
const child=spawn(process.execPath,['apps/api/dist/main.js'],{windowsHide:true,env:{...process.env,NODE_ENV:'test',PORT:String(port),HOST:'127.0.0.1',WEB_ORIGIN:origin,JWT_SECRET:randomBytes(48).toString('hex'),DATABASE_URL:`postgresql://test:${randomBytes(16).toString('hex')}@127.0.0.1:6543/folio_test`,AWS_REGION:process.argv.includes('--without-storage')?'':'ap-southeast-1',S3_BUCKET:process.argv.includes('--without-storage')?'':'folio-test-unused'}});
let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
(async()=>{try{const deadline=Date.now()+60000;while(!output.includes('Nest application successfully started')){if(child.exitCode!==null)throw new Error('API failed to start: '+output);if(Date.now()>deadline)throw new Error('API startup timed out: '+output);await new Promise(r=>setTimeout(r,100))}
const base=`http://127.0.0.1:${port}/api`;
const health=await fetch(base+'/health');assert.equal(health.status,200);assert.equal((await health.json()).storageConfigured,!process.argv.includes('--without-storage'));
assert.equal((await fetch(base+'/documents')).status,401);
assert.equal((await fetch(base+'/users')).status,401);
for(let i=0;i<2;i++){const logout=await fetch(base+'/auth/logout',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'}});assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie'),/dms_refresh=;/);}

assert.equal((await fetch(base+'/auth/refresh',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'})).status,401);
assert.equal((await fetch(base+'/auth/login',{method:'POST',headers:{Origin:'https://untrusted.example','Content-Type':'application/json'},body:'{}'})).status,403);
assert.equal((await fetch(base+'/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:'invalid',password:'x',role:'ADMIN'})})).status,400);
for(let attempt=2;attempt<=4;attempt++){
const result=await fetch(base+'/auth/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({email:'invalid',password:'x'})});
assert.equal(result.status,attempt<=3?400:429,`Login attempt ${attempt}`);
if(attempt===4) assert.ok(Number(result.headers.get('retry-after'))>0);
}
console.log('PASS: API startup, public health, protected routes, refresh rejection, origin enforcement, login validation, and fourth login attempt blocked. No database or AWS service was contacted.');
}catch(e){console.error(e);process.exitCode=1}finally{child.kill()}})();
