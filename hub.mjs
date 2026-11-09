import http from 'node:http';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {Council} from './core.mjs';
import {validateCall} from './tools.mjs';

const configPath=path.resolve(process.argv[2]??'council-data/hub.json');
const config=JSON.parse(readFileSync(configPath,'utf8'));
if(!Number.isInteger(config.port)||config.port<1024||config.port>65535)throw Error('Invalid port');
const identities=new Map();
for(const [id,c] of Object.entries(config.clients??{})){
 if(!/^[a-zA-Z][a-zA-Z0-9-]{0,63}$/.test(id)||['constructor','prototype'].includes(id))throw Error('Invalid client id');
 if(typeof c.token!=='string'||c.token.length<32||identities.has(c.token))throw Error('Invalid or duplicate client token');identities.set(c.token,id);
}
const council=new Council({file:path.resolve(path.dirname(configPath),config.stateFile??'state.json'),backends:config.backends??{}});
const server=http.createServer(async(req,res)=>{
 const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
 if(req.headers.origin)return send(403,{error:'Browser origins are not accepted'});
 const client=identities.get((req.headers.authorization??'').replace(/^Bearer /,''));
 if(!client)return send(401,{error:'Unauthorized'});
 if(req.method!=='POST'||req.url!=='/call')return send(404,{error:'Not found'});
 try{
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>150000){send(413,{error:'Request too large'});return;}chunks.push(chunk);}
  const {name,arguments:args={}}=JSON.parse(Buffer.concat(chunks).toString());validateCall(name,args);
  send(200,{result:council.invoke(client,name,args)});
 }catch(e){send(400,{error:String(e.message).slice(0,1800)});}
});
server.requestTimeout=15000;server.headersTimeout=10000;
server.on('error',e=>{console.error('Council hub:',e.message);process.exitCode=1;});
server.listen(config.port,'127.0.0.1',()=>console.error(`AI Council listening on 127.0.0.1:${config.port}; local clients only`));
function stop(){for(const peers of council.running.values())for(const {peer}of peers)peer.close('Hub stopping');server.close();setTimeout(()=>process.exit(),2000).unref();}
process.on('SIGINT',stop);process.on('SIGTERM',stop);
