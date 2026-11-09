import readline from 'node:readline';
import {readFileSync} from 'node:fs';
import {tools,validateCall} from './tools.mjs';
const config=JSON.parse(readFileSync(process.argv[2],'utf8'));
const url=new URL(config.url);if(url.hostname!=='127.0.0.1'||url.protocol!=='http:')throw Error('Only local hub is supported in v0.1');
const output=m=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',...m})+'\n');
const text=value=>({content:[{type:'text',text:JSON.stringify(value)}]});
readline.createInterface({input:process.stdin}).on('line',async line=>{
 let m;try{if(line.length>160000)throw Error('Too large');m=JSON.parse(line);}catch{output({id:null,error:{code:-32700,message:'Invalid JSON'}});return;}
 if(m.id===undefined)return;
 try{
  let result;
  if(m.method==='initialize')result={protocolVersion:['2024-11-05','2025-03-26','2025-06-18','2025-11-25'].includes(m.params?.protocolVersion)?m.params.protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'ai-council',version:'0.1.0'},instructions:'User-authorized multi-AI meetings. Create/join room and exchange messages. Idle desktop clients cannot be woken by MCP alone. For automatic discussion use room_run with configured backends. Poll job_status within this turn and summarize room_read results. Never claim completed means consensus. Preserve request IDs on identical retries.'};
  else if(m.method==='ping')result={};
  else if(m.method==='tools/list')result={tools};
  else if(m.method==='tools/call'){
   const name=m.params?.name,args=m.params?.arguments??{};validateCall(name,args);
   const response=await fetch(config.url+'/call',{method:'POST',headers:{Authorization:'Bearer '+config.token,'Content-Type':'application/json'},body:JSON.stringify({name,arguments:args}),signal:AbortSignal.timeout(15000)});
   const body=await response.json();if(!response.ok)throw Error(body.error??`HTTP ${response.status}`);result=text(body.result);
  }else throw Error('Unsupported method');
  output({id:m.id,result});
 }catch(e){output({id:m.id,...(m.method==='tools/call'?{result:{...text({error:e.message}),isError:true}}:{error:{code:-32602,message:e.message}})});}
});
