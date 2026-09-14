const {config}=require('dotenv');
config({path:'.env.local',quiet:true}); config({path:'.env',quiet:true});
const {S3Client,HeadBucketCommand,GetBucketVersioningCommand,GetBucketCorsCommand,PutObjectCommand,GetObjectCommand,DeleteObjectCommand}=require('@aws-sdk/client-s3');
const {getSignedUrl}=require('@aws-sdk/s3-request-presigner');
const {randomUUID,createHash}=require('node:crypto');
async function main(){
 const Bucket=process.env.S3_BUCKET, region=process.env.AWS_REGION;
 if(!Bucket||!region) throw new Error('S3_BUCKET or AWS_REGION missing');
 console.log(JSON.stringify({bucket:Bucket,region}));
 const client=new S3Client({region,maxAttempts:1});
 for(const [name,Command] of [['bucket',HeadBucketCommand],['versioning',GetBucketVersioningCommand],['cors',GetBucketCorsCommand]]){
  try{const r=await client.send(new Command({Bucket})); console.log(JSON.stringify({check:name,ok:true,status:r.Status,cors:r.CORSRules}));}
  catch(e){console.log(JSON.stringify({check:name,ok:false,code:e.name,message:e.message}));}
 }
 const Key=`staging/diagnostics/${randomUUID()}`,Body=Buffer.from('Folio S3 connectivity test\n');
 const checksum=createHash('sha256').update(Body).digest('base64');
 let uploaded=false,VersionId;
 try{
  const url=await getSignedUrl(client,new PutObjectCommand({Bucket,Key,ContentType:'text/plain',ContentLength:Body.length,ChecksumSHA256:checksum,ServerSideEncryption:'AES256'}),{expiresIn:60,unhoistableHeaders:new Set(['x-amz-checksum-sha256','x-amz-server-side-encryption'])});
  const r=await fetch(url,{method:'PUT',headers:{'Content-Type':'text/plain','x-amz-checksum-sha256':checksum,'x-amz-server-side-encryption':'AES256'},body:Body,signal:AbortSignal.timeout(20000)});
  if(!r.ok){const xml=await r.text(); console.log(JSON.stringify({check:'signed-upload',ok:false,status:r.status,code:xml.match(/<Code>(.*?)<\/Code>/s)?.[1],message:xml.match(/<Message>(.*?)<\/Message>/s)?.[1]}));return;}
  uploaded=true;VersionId=r.headers.get('x-amz-version-id')||undefined;
  console.log(JSON.stringify({check:'signed-upload',ok:true,versioned:!!VersionId&&VersionId!=='null'}));
  const read=await client.send(new GetObjectCommand({Bucket,Key,VersionId}));
  console.log(JSON.stringify({check:'read-back',ok:(await read.Body.transformToString())===Body.toString()}));
 }finally{if(uploaded){try{await client.send(new DeleteObjectCommand({Bucket,Key,VersionId}));console.log(JSON.stringify({check:'test-cleanup',ok:true}));}catch(e){console.log(JSON.stringify({check:'test-cleanup',ok:false,code:e.name,key:Key,versionId:VersionId}));}}client.destroy();}
}
main().catch(e=>{console.error(JSON.stringify({code:e.name,message:e.message}));process.exitCode=1;});
