import {randomUUID,createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,renameSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {createPeer} from './adapters.mjs';

function string(v,label,max=24000){if(typeof v!=='string'||!v.trim()||v.length>max)throw Error(`Invalid ${label}`);return v;}
export class Council {
  constructor({file,backends={},peerFactory=createPeer}) {
    this.file=file;this.backends=backends;this.peerFactory=peerFactory;this.running=new Map();
    this.state=file&&existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{rooms:{},requests:{},jobs:{}};
    for(const j of Object.values(this.state.jobs))if(['running','queued'].includes(j.status)){j.status='interrupted';j.error='Service restarted; inspect transcript before starting a new job';}
    this.save();
  }
  save(){if(!this.file)return;mkdirSync(path.dirname(this.file),{recursive:true});writeFileSync(this.file+'.tmp',JSON.stringify(this.state,null,2),{mode:0o600});renameSync(this.file+'.tmp',this.file);}
  room(id){const r=this.state.rooms[id];if(!r)throw Error('Unknown room');return r;}
  member(r,client){if(!r.members[client])throw Error('Join this room first');}
  append(r,author,body,kind='message'){if(body.length>60000)throw Error('Message too large');const m={seq:r.messages.length+1,at:new Date().toISOString(),author,kind,body};r.messages.push(m);return m;}
  invoke(client,name,a={}) {
    if(name==='council_status')return {client,scope:'single-machine',backends:Object.entries(this.backends).map(([id,b])=>({id,type:b.type,automatic:true})),note:'MCP inbox delivery alone cannot wake an idle client. Configured backends are not necessarily authenticated.'};
    if(name==='room_read'){const r=this.room(a.room_id);this.member(r,client);const after=a.after??0;if(!Number.isInteger(after)||after<0)throw Error('Invalid cursor');return {room_id:r.id,goal:r.goal,mode:r.mode,closed:r.closed,members:r.members,messages:r.messages.filter(m=>m.seq>after).slice(0,100),last_seq:r.messages.length};}
    if(name==='job_status'){const j=this.state.jobs[a.job_id];if(!j)throw Error('Unknown job');this.member(this.room(j.room_id),client);return j;}
    string(a.request_id,'request_id',128);
    const key=client+':'+a.request_id,signature=createHash('sha256').update(JSON.stringify({name,a})).digest('hex');
    const cached=this.state.requests[key];if(cached){if(cached.signature!==signature)throw Error('request_id reused for different arguments');return cached.result;}
    if(Object.keys(this.state.requests).length>=10000)throw Error('Request storage limit reached; export and start a fresh data directory');
    let result;
    if(name==='room_create'){
      if(Object.keys(this.state.rooms).length>=100)throw Error('Room limit reached');
      if(!['discussion','review'].includes(a.mode))throw Error('Invalid mode');
      const r={id:randomUUID(),title:string(a.title,'title',120),goal:string(a.goal,'goal'),mode:a.mode,owner:client,members:{[client]:{role:'host'}},messages:[],closed:false};
      this.state.rooms[r.id]=r;result={room_id:r.id};
    }else if(name==='room_join'){
      const r=this.room(a.room_id);if(r.closed)throw Error('Room closed');r.members[client]={role:string(a.role,'role',80)};result={joined:true,room_id:r.id};
    }else if(name==='room_say'){
      const r=this.room(a.room_id);this.member(r,client);if(r.closed)throw Error('Room closed');
      if(r.messages.length>=500)throw Error('Transcript limit reached');result=this.append(r,client,string(a.message,'message'));
    }else if(name==='room_close'){
      const r=this.room(a.room_id);if(r.owner!==client)throw Error('Only room owner can close');if(this.running.has(r.id))throw Error('Wait for active job to finish');r.closed=true;result={closed:true};
    }else if(name==='job_cancel'){
      const j=this.state.jobs[a.job_id];if(!j)throw Error('Unknown job');
      const r=this.room(j.room_id);if(r.owner!==client)throw Error('Only room owner can cancel');
      if(['queued','running'].includes(j.status)){j.cancel_requested=true;for(const {peer}of this.running.get(r.id)??[])peer.close('Meeting cancelled');}
      result={job_id:j.id,cancel_requested:!!j.cancel_requested,status:j.status};
    }else if(name==='room_run'){
      const r=this.room(a.room_id);if(r.owner!==client)throw Error('Only room owner can start backend work');if(r.closed||this.running.has(r.id))throw Error('Room closed or busy');
      if(this.running.size>=2)throw Error('Two concurrent meetings maximum');
      if(!Array.isArray(a.participants)||a.participants.length<2||a.participants.length>4||new Set(a.participants).size!==a.participants.length)throw Error('Select 2–4 distinct backends');
      for(const id of a.participants)if(!Object.hasOwn(this.backends,id))throw Error('Backend not configured: '+id);
      if(!Number.isInteger(a.rounds)||a.rounds<1||a.rounds>6)throw Error('Rounds must be 1–6');
      string(a.seed,'seed');
      if(r.messages.length+1+a.rounds*a.participants.length>500)throw Error('Transcript limit reached');
      const j={id:randomUUID(),room_id:r.id,status:'queued',participants:a.participants,rounds:a.rounds,completed_turns:0,started_at:new Date().toISOString()};
      this.state.jobs[j.id]=j;this.append(r,client,a.seed,'seed');this.running.set(r.id,[]);
      result={job_id:j.id,status:'queued',note:'The hub continues this bounded job independently. Poll job_status and read room transcript.'};
      setImmediate(()=>this.run(j,a.seed));
    }else throw Error('Unknown tool');
    this.state.requests[key]={signature,result};this.save();return result;
  }
  async run(job,seed){
    const r=this.room(job.room_id),peers=[];
    try{
      if(job.cancel_requested)throw Error('Meeting cancelled');
      job.status='running';this.save();
      for(const id of job.participants){const peer=this.peerFactory(this.backends[id]);peers.push({id,peer});this.running.set(r.id,peers);}
      for(let round=1;round<=job.rounds;round++)for(let index=0;index<peers.length;index++){
        if(job.cancel_requested)throw Error('Meeting cancelled');
        const {id,peer}=peers[index];
        const role=r.mode==='review'?(index===0?'author: produce or revise the candidate from reviewer feedback':'reviewer: evaluate the latest candidate, identify blockers'):'discussant: respond to the other views and preserve unresolved disagreements';
        const transcript=r.messages.map(m=>({author:m.author,body:m.body}));
        const message=JSON.stringify({round,role,original_seed:seed,transcript});
        if(message.length>70000)throw Error('Context limit reached; meeting stopped without silently truncating');
        const reply=await peer.exchange(r.goal,message,r.mode);
        if(typeof reply!=='string'||!reply.trim())throw Error('Empty backend response');
        this.append(r,id,reply,'backend_reply');job.completed_turns++;this.save();
      }
      job.status='completed';job.note='Configured round limit reached. Completion does not imply consensus or reviewer approval.';
    }catch(e){job.status=job.cancel_requested?'cancelled':'failed';job.error=String(e.message).slice(0,1800);}
    finally{for(const {peer}of peers)peer.close();job.finished_at=new Date().toISOString();this.running.delete(r.id);this.save();}
  }
}
