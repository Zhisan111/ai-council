import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {AntigravityPeer,DeepSeekHarnessPeer} from '../native-peers.mjs';
import {createPeer} from '../adapters.mjs';
const fixture=fileURLToPath(new URL('./fixtures/native.mjs',import.meta.url));
function peer(provider,scenario='success',timeoutMs=3000){return new (provider==='antigravity'?AntigravityPeer:DeepSeekHarnessPeer)({command:process.execPath,args:[fixture,provider,scenario],timeoutMs});}
for(const provider of ['antigravity','deepseek']){
 test(`${provider}: complete replies and two-turn session continuity`,async()=>{
  const p=peer(provider);try{
   const a=await p.exchange('test','remember 青松','discussion');assert.match(a,/青松/);assert.doesNotMatch(a,/PARTIAL|PREVIEW/);
   const session=p.session;const b=await p.exchange('test','recall','discussion');assert.match(b,/青松/);assert.equal(p.session,session);assert.equal(p.round,2);
  }finally{p.close();}
 });
 for(const scenario of ['partial-exit','failed','tool','timeout'])test(`${provider}: rejects ${scenario}`,async()=>{
  const p=peer(provider,scenario,scenario==='timeout'?150:3000);try{await assert.rejects(p.exchange('test','hello','review'));assert.equal(p.round,0);}finally{p.close();}
 });
 test(`${provider}: cancellation rejects the active exchange`,async()=>{
  const p=peer(provider,'timeout');const pending=p.exchange('test','hello','review');setTimeout(()=>p.close('Cancelled'),30);await assert.rejects(pending,/Cancelled/);
 });
}
test('DeepSeek requires successful process exit in addition to final event',async()=>{
 const p=peer('deepseek','exit-failure');try{await assert.rejects(p.exchange('test','hello','review'),/exit 1/);}finally{p.close();}
});
test('DeepSeek rejects a different session on continuation',async()=>{
 const p=peer('deepseek','mismatch');try{await p.exchange('test','first','discussion');await assert.rejects(p.exchange('test','next','discussion'),/wrong session/);}finally{p.close();}
});
test('Antigravity rejects wrong conversation ID',async()=>{
 const p=peer('antigravity','mismatch');try{await assert.rejects(p.exchange('test','hello','discussion'),/mismatch/);}finally{p.close();}
});
test('DeepSeek missing credentials is actionable without leaking provider diagnostics',async()=>{
 const p=peer('deepseek','credentials');try{await assert.rejects(p.exchange('test','hello','discussion'),e=>e.message.includes('MISSING_CREDENTIAL')&&!e.message.includes('private provider'));}finally{p.close();}
});
test('registry routes both native providers',()=>{
 for(const type of ['antigravity','deepseek-harness']){
  const p=createPeer({type,command:process.execPath});assert.ok(p instanceof (type==='antigravity'?AntigravityPeer:DeepSeekHarnessPeer));p.close();
 }
});
