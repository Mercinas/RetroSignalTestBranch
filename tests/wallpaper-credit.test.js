import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RunningSessionUnion } from '../manager/running-session-union.mjs';
import { PlayCreditTracker } from '../manager/play-credit.mjs';
import { WallpaperPlayReporter } from '../js/play-session-bridge.js';
const sample = (union, source, now, sequence, active=true, sessionId=source) => union.observe(source,{sessionId,sequence,active},now);

test('simultaneous wallpaper and desktop sessions earn the union, not the sum', () => {
 const union=new RunningSessionUnion(); const tracker=new PlayCreditTracker({id:'union'});
 for(let i=0;i<=10;i++){sample(union,'wallpaper',i*1000,i+1);sample(union,'desktop',i*1000,i+1);tracker.pendingMilliseconds+=union.settle(i*1000);}
 tracker.pendingMilliseconds+=union.settle(13000);
 assert.equal(tracker.snapshot().credits[0].creditedSeconds,10);
 assert.deepEqual(PlayCreditTracker.restore(tracker.toJSON()).snapshot().credits,tracker.snapshot().credits);
});
test('crash, pause, late heartbeat and replay grant no unobserved intervals',()=>{
 const union=new RunningSessionUnion(); sample(union,'wallpaper',0,1);sample(union,'wallpaper',1000,2);
 assert.equal(sample(union,'wallpaper',2000,2),false);
 assert.equal(union.settle(5000),1000);assert.equal(union.active(5000),false);
 sample(union,'wallpaper',6000,3);sample(union,'wallpaper',7000,4,false);sample(union,'wallpaper',8000,5);
 sample(union,'wallpaper',9000,6);sample(union,'wallpaper',10000,8);sample(union,'wallpaper',11000,9);
 assert.equal(union.settle(14000),2000); assert.equal(union.settle(20000),0);
 const reopened=new RunningSessionUnion();sample(reopened,'wallpaper',100000,10);assert.equal(reopened.settle(104000),0);
});
test('late overlapping delivery cannot recredit already settled time, and bounded sources fail closed',()=>{
 const union=new RunningSessionUnion({maximumSources:2});sample(union,'a',0,1);sample(union,'a',1000,2);
 assert.equal(union.settle(4000),1000);sample(union,'b',0,1);sample(union,'b',1000,2);
 assert.equal(union.settle(5000),0);
 const bounded=new RunningSessionUnion({maximumSources:1});sample(bounded,'a',0,1);
 assert.throws(()=>sample(bounded,'b',1,1),/Too many/);assert.doesNotThrow(()=>sample(bounded,'b',5000,1));
});
test('authenticated wallpaper route validates minimal payload and startup forwards observer',async context=>{
 const {mkdtemp}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {startManager}=await import('../manager/server.js');const union=new RunningSessionUnion();let now=0;
 const manager=await startManager({dataRoot:await mkdtemp(join(tmpdir(),'wallpaper-credit-')),port:0,discoverWallpaper:false,
 wallpaperPlayState:payload=>union.observe('wallpaper',payload,now)});
 context.after(()=>new Promise(resolve=>manager.server.close(resolve)));
 const post=(payload,authorized=true)=>fetch(manager.endpoint+'/api/v1/wallpaper-play-state',{method:'POST',headers:{'Content-Type':'application/json',...(authorized?{'X-RetroSignal-Token':manager.token}:{})},body:JSON.stringify(payload)});
 const payload={sessionId:'wallpaper',sequence:1,active:true};assert.equal((await post(payload,false)).status,401);
 assert.equal((await post({...payload,romPath:'forbidden'})).status,400);
 assert.equal((await post({...payload,sequence:1.5})).status,400);
 assert.equal((await post(payload)).status,200);now=1000;assert.equal((await post({...payload,sequence:2})).status,200);
 assert.equal((await (await post({...payload,sequence:2})).json()).accepted,false);assert.equal(union.settle(4000),1000);
});
test('wallpaper reporter sends aggregate state, invalidates failed pairing and stops cleanly',async()=>{
 const requests=[];let timer;let active=true;
 const env={crypto:{randomUUID:()=> 'wallpaper-id'},AbortController,setTimeout,clearTimeout,
 setInterval:callback=>{timer=callback;return 1},clearInterval:id=>assert.equal(id,1),
 fetch:async(url,options)=>{if(url==='manager.json')return {ok:true,json:async()=>({endpoint:'http://127.0.0.1:41237',token:'s'.repeat(43)})};requests.push(JSON.parse(options.body));return {ok:true}}};
 const reporter=new WallpaperPlayReporter(()=>active,env);reporter.start();assert.equal(typeof timer,'function');
 await reporter.tick();active=false;await reporter.tick();reporter.stop();await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(requests,[{sessionId:'wallpaper-id',sequence:1,active:true},{sessionId:'wallpaper-id',sequence:2,active:false},{sessionId:'wallpaper-id',sequence:3,active:false}]);
 await reporter.tick();assert.equal(requests.length,3);
});

test('a stalled or crashed desktop renderer cannot block wallpaper settlement',async()=>{
 const {observePlayerWithTimeout}=await import('../manager/play-credit.mjs');
 assert.deepEqual(await observePlayerWithTimeout(()=>new Promise(()=>{}),5),{active:false});
 assert.deepEqual(await observePlayerWithTimeout(()=>{throw Error('renderer gone')},5),{active:false});
 assert.deepEqual(await observePlayerWithTimeout(()=>({active:true,sessionId:'desktop'}),5),{active:true,sessionId:'desktop'});
});
