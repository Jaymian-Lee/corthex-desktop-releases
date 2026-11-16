import {_electron,expect} from '@playwright/test';
import {readFile,writeFile,readdir,access} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const directory=resolve(process.env.RUNNER_TEMP,'corthex-installer-acceptance'),target=join(directory,'app'),installer=join(directory,'installer.exe'),version=process.env.QA_VERSION;
assert.equal(createHash('sha256').update(await readFile(installer)).digest('hex'),process.env.QA_SHA256);
for(const name of ['vk_swiftshader.dll','vk_swiftshader_icd.json','vulkan-1.dll'])await assert.rejects(access(join(target,name)));
async function inventory(path){const files=[];for(const item of await readdir(path,{withFileTypes:true})){assert.equal(item.isSymbolicLink(),false);const child=join(path,item.name);if(item.isDirectory())files.push(...await inventory(child));else if(/\.(exe|dll|node)$/i.test(item.name))files.push(child);}return files;}
const files=[...await inventory(target),installer];assert.ok(files.includes(join(target,'Uninstall Corthex.exe')));
const script=`$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue';$targets=ConvertFrom-Json ([Console]::In.ReadToEnd());$reports=@(foreach($file in $targets){$s=Get-AuthenticodeSignature -LiteralPath $file;$c=$s.SignerCertificate;$p=$null;if($c){$p=$c.GetNameInfo([Security.Cryptography.X509Certificates.X509NameType]::SimpleName,$false)};[pscustomobject]@{path=$file;status=[string]$s.Status;publisher=$p;selfSigned=(!$c -or $c.Subject -eq $c.Issuer);timestamped=($null -ne $s.TimeStamperCertificate)}});ConvertTo-Json -InputObject $reports -Compress`;
const reports=JSON.parse(execFileSync(join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{input:JSON.stringify(files),encoding:'utf8',windowsHide:true,env:{...process.env,PSModulePath:undefined}}));
assert.equal(reports.length,files.length);for(const report of reports){if([join(target,'Corthex.exe'),join(target,'Uninstall Corthex.exe'),installer].includes(report.path))assert.equal(report.status,'NotSigned');else assert.ok(report.status==='NotSigned'||(report.status==='Valid'&&report.publisher&&!report.selfSigned&&report.timestamped));}
const app=await _electron.launch({executablePath:join(target,'Corthex.exe'),env:{...process.env,CORTHEX_DESKTOP_TEST:'1',CORTHEX_DESKTOP_TEST_ORIGIN:'http://127.0.0.1:9'}});
try{
 await expect.poll(()=>app.windows().some(p=>/^https:\/\/(www\.)?corthex\.app\//.test(p.url())),{timeout:30_000}).toBe(true);
 const page=app.windows().find(p=>/^https:\/\/(www\.)?corthex\.app\//.test(p.url()));await page.waitForLoadState('domcontentloaded');
 assert.equal(await app.evaluate(({app})=>app.isPackaged),true);assert.equal(await app.evaluate(()=>typeof globalThis.__corthexTest),'undefined');assert.equal(await page.evaluate(()=>typeof window.require),'undefined');assert.equal(await page.evaluate(()=>window.corthexDesktop.version),version);assert.equal(await page.evaluate(()=>typeof window.corthexDesktop.signInWithBrowser),'function');
 await expect(page.getByRole('button',{name:'Continue in browser',exact:true})).toBeVisible({timeout:30_000});
 assert.equal(await app.evaluate(({Menu})=>Menu.getApplicationMenu()===null),true);
 await app.evaluate(({Notification})=>{globalThis.__qaNotice='waiting';const show=Notification.prototype.show;Notification.prototype.show=function(){this.once('show',()=>globalThis.__qaNotice='shown');this.once('failed',()=>globalThis.__qaNotice='failed');return show.call(this);};});
 await page.evaluate(()=>window.corthexDesktop.testNotification());await expect.poll(()=>app.evaluate(()=>globalThis.__qaNotice),{timeout:20_000}).not.toBe('waiting');const notification=await app.evaluate(()=>globalThis.__qaNotice);assert.equal(notification,'shown');
 const receipt={passed:true,verifiedAt:new Date().toISOString(),installed:true,packaged:true,fixtureSwitchDenied:true,version,installerSha256:process.env.QA_SHA256,productionOrigin:new URL(page.url()).origin,nativeNotification:notification,browserLoginButton:true,windowsSignatures:{passed:true,signingMode:'unsigned',publisher:null,verifiedAt:new Date().toISOString(),files:reports},githubRunId:process.env.GITHUB_RUN_ID,workflowCommit:process.env.GITHUB_SHA};
 await writeFile(join(directory,'installed-acceptance.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify({passed:true,version,nativeNotification:notification}));
}finally{await app.close();}

