import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import net from 'node:net';
import {McpPeer} from '../adapters.mjs';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
test('HTTP authentication, independent MCP processes, persistence and unattended job',async()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'council-test-'));
 const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const fixture=path.join(dir,'peer.mjs');
 writeFileSync(fixture,`import readline from 'node:readline';readline.createInterface({input:process.stdin}).on('line',l=>{const m=JSON.parse(l);if(m.id===undefined)return;const result=m.method==='initialize'?{protocolVersion:'2025-11-25',capabilities:{},serverInfo:{name:'test',version:'1'}}:{content:[{type:'text',text:JSON.stringify({meeting_id:'fixture-session',reply:'REVISE: deterministic fixture, not a real AI'})}]};process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\\n');});`);
 const backend={type:'mcp-peer',command:process.execPath,args:[fixture],exchangeTool:'exchange'};
 const config=path.join(dir,'hub.json');
 writeFileSync(config,JSON.stringify({port,clients:{alice:{token:'a'.repeat(64)},bob:{token:'b'.repeat(64)}},backends:{writer:backend,reviewer:backend}}));
 const hub=spawn(process.execPath,[path.join(root,'hub.mjs'),config],{windowsHide:true,stdio:['ignore','ignore','pipe']});
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Hub startup timeout')),5000);hub.stderr.once('data',()=>{clearTimeout(timer);resolve();});hub.once('error',reject);});
  const call=async(token,name,args={})=>{const res=await fetch(`http://127.0.0.1:${port}/call`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({name,arguments:args})});return {status:res.status,...await res.json()};};
  assert.equal((await call('wrong','council_status')).status,401);
  const clientPath=path.join(dir,'alice.json');writeFileSync(clientPath,JSON.stringify({url:`http://127.0.0.1:${port}`,token:'a'.repeat(64)}));
  // Use a real MCP transport connection, then disconnect it while the hub works.
  const mcp=new McpPeer({command:process.execPath,args:[path.join(root,'mcp.mjs'),clientPath]});await mcp.start();
  const result=await mcp.request('tools/call',{name:'room_create',arguments:{title:'transport',goal:'test',mode:'discussion',request_id:'create'}});
  const {room_id}=JSON.parse(result.content[0].text);
  assert.equal((await call('b'.repeat(64),'room_read',{room_id})).status,400);
  assert.equal((await call('b'.repeat(64),'room_join',{room_id,role:'observer',request_id:'join'})).status,200);
  const run=await mcp.request('tools/call',{name:'room_run',arguments:{room_id,participants:['writer','reviewer'],rounds:2,seed:'hello',request_id:'run'}});
  const {job_id}=JSON.parse(run.content[0].text);mcp.close();
  let job;
  for(let i=0;i<100;i++){job=(await call('b'.repeat(64),'job_status',{job_id})).result;if(job.status==='completed'||job.status==='failed')break;await new Promise(r=>setTimeout(r,50));}
  assert.equal(job.status,'completed');assert.equal(job.completed_turns,4);
  const transcript=(await call('b'.repeat(64),'room_read',{room_id})).result;
  assert.equal(transcript.messages.length,5);
  const saved=JSON.parse(readFileSync(path.join(dir,'state.json'),'utf8'));assert.equal(saved.jobs[job_id].status,'completed');
 }finally{hub.kill();await new Promise(r=>setTimeout(r,250));rmSync(dir,{recursive:true,force:true});}
});
