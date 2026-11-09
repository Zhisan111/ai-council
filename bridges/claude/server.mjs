import {ClaudePeer, authStatus} from './claude-peer.mjs';
import {spawn} from 'node:child_process';
import readline from 'node:readline';
import {randomUUID, createHash} from 'node:crypto';
import {mkdirSync, appendFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.dirname(fileURLToPath(import.meta.url));
const sessions=new Map(), calls=new Map();
const out=m=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',...m})+'\n');
const toolResult=x=>({content:[{type:'text',text:JSON.stringify(x)}]});
function audit(event){
 mkdirSync(path.join(root,'logs'),{recursive:true});
 appendFileSync(path.join(root,'logs','events.jsonl'),JSON.stringify({at:new Date().toISOString(),...event})+'\n');
}
class Partner extends ClaudePeer {
 constructor(mode,goal){super(mode,goal,{root,audit,onClose:id=>sessions.delete(id)});}
}
const tools=[{name:'claude_status',description:'Check whether the official Claude Code backend is logged in. Does not reveal account identifiers or credentials.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,openWorldHint:false}},{
 name:'claude_exchange',description:'Send your draft or discussion point to an independent Claude working session and WAIT for its reply in this tool result. The user must authorize Claude collaboration. Review mode: provide original goal and complete candidate, then revise from feedback and call again in the same GPT turn until PASS, NEED_USER or the user’s round limit. Discussion mode: exchange substantive views, then summarize consensus and unresolved differences. No inbox polling or user wake-up between calls. Maximum six exchanges/session, ten-minute idle expiry. Claude does not access files. New tasks need a new session. Returns meeting_id; use it for follow-ups. A failed call must be inspected before retrying.',
 inputSchema:{type:'object',properties:{mode:{type:'string',enum:['review','discussion']},goal:{type:'string',description:'Original user goal and acceptance criteria, unchanged across a session.'},message:{type:'string',description:'Complete draft or discussion message; include evidence and relevant previous context.'},meeting_id:{type:'string',description:'Required. Use the literal new for the first exchange; use the returned meeting_id for every follow-up.'},request_id:{type:'string',description:'Unique per exchange; reuse only for an identical retry to avoid duplicate generation.'}},required:['mode','goal','message','request_id','meeting_id'],additionalProperties:false},annotations:{readOnlyHint:true,destructiveHint:false,openWorldHint:true}
},{name:'claude_end_session',description:'Release only this plugin-owned temporary Claude process and in-memory meeting. Does not delete files, persisted chats, accounts, or other application processes.',inputSchema:{type:'object',properties:{meeting_id:{type:'string'}},required:['meeting_id'],additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false}}];
const active=new Map();
async function dispatch(m){
 if(m.method==='initialize')return {protocolVersion:['2024-11-05','2025-03-26','2025-06-18','2025-11-25'].includes(m.params?.protocolVersion)?m.params.protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'gpt-claude-relay',version:'0.1.0'},instructions:'Use only when the user asks for Claude collaboration. Call claude_exchange with meeting_id=new, then reuse its returned meeting_id and unchanged goal/mode for follow-ups. Continue review or discussion within the same turn; do not ask the user to wake Claude between exchanges. Respect the user round limit, maximum six. Close with claude_end_session. Claude receives only the supplied text, cannot inspect files or run tests, and uses an independent official Claude Code session.'};
 if(m.method==='ping')return {};
 if(m.method==='tools/list')return {tools};
 if(m.method!=='tools/call')throw Error('Unsupported method');
 const a=m.params?.arguments??{},name=m.params?.name;
 audit({event:'tool_received',tool:name,argument_keys:Object.keys(a),meeting_id:a.meeting_id??null});
 if(name==='claude_status')return toolResult(await authStatus());
 if(name==='claude_end_session'){const s=sessions.get(a.meeting_id);if(!s)throw Error('Unknown meeting_id; no session was closed');s.close();return toolResult({closed:true});}
 if(name!=='claude_exchange')throw Error('Unknown tool');
 if(!['review','discussion'].includes(a.mode))throw Error('Invalid mode');
 for(const key of ['goal','message','request_id'])if(typeof a[key]!=='string'||!a[key].trim())throw Error('Missing '+key);
 if(a.goal.length>20000||a.message.length>80000||a.request_id.length>200)throw Error('Input too large');
 const signature=createHash('sha256').update(JSON.stringify(a)).digest('hex');
 const cached=calls.get(a.request_id);if(cached){if(cached.signature!==signature)throw Error('request_id already used for different input');return cached.promise;}
 if(calls.size>=128)throw Error('Server exchange cache limit reached; restart server after active meetings end');
 let session;
 if(typeof a.meeting_id !== 'string' || !a.meeting_id.trim())throw Error('meeting_id is required: use new for a first exchange');
 if(a.meeting_id!=='new'){session=sessions.get(a.meeting_id);if(!session)throw Error('Session expired or unknown; start a new session');if(session.mode!==a.mode||session.goal!==a.goal)throw Error('Session goal/mode cannot change');}
 else {if(sessions.size>=4)throw Error('Four active sessions maximum');session=new Partner(a.mode,a.goal);sessions.set(session.id,session);audit({event:'session_started',meeting_id:session.id,mode:a.mode});}
 active.set(m.id,session);
 const promise=session.exchange(a.message).then(toolResult).catch(e=>({isError:true,...toolResult({error:e.message})})).finally(()=>active.delete(m.id));
 calls.set(a.request_id,{signature,promise});return promise;
}
const input=readline.createInterface({input:process.stdin});
input.on('line',async line=>{
 let m;try{m=JSON.parse(line);}catch{out({id:null,error:{code:-32700,message:'Parse error'}});return;}
 if(m.method==='notifications/cancelled'){active.get(m.params?.requestId)?.close('Cancelled by Claude');return;}
 if(m.id===undefined)return;
 try{out({id:m.id,result:await dispatch(m)});}catch(e){out({id:m.id,...(m.method==='tools/call'?{result:{isError:true,...toolResult({error:e.message})}}:{error:{code:-32602,message:e.message}})});}
});
input.on('close',()=>{for(const s of [...sessions.values()])s.close('Claude disconnected');});
