import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const {QA_VERSION:version,QA_SHA256:sha,QA_RELEASE_ID:id,GH_TOKEN:token,GITHUB_REPOSITORY:repository}=process.env;
assert.equal(repository,'Jaymian-Lee/corthex-desktop-releases');assert.match(version,/^\d+\.\d+\.\d+$/);assert.match(sha,/^[a-f0-9]{64}$/);assert.match(id,/^\d+$/);
const headers={Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
const response=await fetch(`https://api.github.com/repos/${repository}/releases/${id}`,{headers});assert.equal(response.status,200);
const release=await response.json();assert.equal(release.tag_name,`v${version}`);assert.equal(release.draft,true);
const asset=release.assets.find(a=>a.name===`Corthex-${version}-Setup.exe`);assert.ok(asset&&asset.size>0&&asset.size<300*1024*1024);
const binary=await fetch(`https://api.github.com/repos/${repository}/releases/assets/${asset.id}`,{headers:{...headers,Accept:'application/octet-stream'},signal:AbortSignal.timeout(300_000)});assert.equal(binary.status,200);
const data=Buffer.from(await binary.arrayBuffer());assert.equal(data.length,asset.size);assert.equal(createHash('sha256').update(data).digest('hex'),sha);
const directory=join(process.env.RUNNER_TEMP,'corthex-installer-acceptance');await mkdir(directory,{recursive:true});
await writeFile(join(directory,'installer.exe'),data);console.log(`Verified candidate ${version}; ${data.length} bytes; SHA-256 matches.`);

