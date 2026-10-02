import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {listPackage,extractFile} from '@electron/asar';
const output=resolve(process.argv[2]),archive=join(output,'win-unpacked/resources/app.asar');
const paths=listPackage(archive).map(p=>p.replaceAll('\\','/'));
assert.ok(!paths.some(p=>/\/packages\/garden|\/manager\/(garden|play-credit|running-session)/.test(p)),'No garden modules or assets in Manager archive');
assert.ok(!paths.some(p=>/\.(nes|gb|gbc|gba|sfc|smc|sav|srm|state|retrogarden)$/i.test(p)),'No game, firmware or save payloads');
const metadata=JSON.parse(extractFile(archive,'package.json'));
for(const name of ['electron-main.mjs','electron-preload.cjs','page.js','server.js']){
 const bytes=extractFile(archive,'manager/'+name);
 assert.deepEqual(bytes,readFileSync('manager/'+name));
 assert.doesNotMatch(bytes.toString(),/GardenStorage|manager-garden|packages\/garden|gardenPersistence|gardenEnabled/);
}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const cores=readFileSync('emulatorjs/cores/RELEASE_FILES.txt','utf8').trim().split(/\r?\n/);
assert.equal(cores.length,20);
assert.deepEqual(readdirSync(join(output,'win-unpacked/resources/player-runtime/emulatorjs/cores')).filter(name=>name.endsWith('.data')).sort(),[...cores].sort());
for(const name of cores)assert.equal(hash(readFileSync(join(output,'win-unpacked/resources/player-runtime/emulatorjs/cores',name))),hash(readFileSync(join('emulatorjs/cores',name))));
const result={passed:true,version:metadata.version,archiveBytes:statSync(archive).size,archiveEntries:paths.length,gardenEntries:0,coreBinaries:cores.length,noUserPayloads:true,checkedAt:new Date().toISOString()};
writeFileSync(join(output,'verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
