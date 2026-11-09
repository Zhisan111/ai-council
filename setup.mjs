import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const dir=path.resolve(process.argv[2]??'council-data');
if(existsSync(path.join(dir,'hub.json')))throw Error('Configuration already exists; refusing to overwrite identities');
mkdirSync(dir,{recursive:true});
const clients={},examples={};
for(const id of ['gpt','claude','deepseek','antigravity']){
 const token=randomBytes(32).toString('hex');clients[id]={token};
 const file=path.join(dir,id+'.json');
 writeFileSync(file,JSON.stringify({url:'http://127.0.0.1:43189',token},null,2),{mode:0o600});
 examples[id]={mcpServers:{'ai-council':{command:process.execPath,args:[path.join(root,'mcp.mjs'),file]}}};
}
writeFileSync(path.join(dir,'hub.json'),JSON.stringify({port:43189,stateFile:'state.json',clients,backends:{}},null,2),{mode:0o600});
writeFileSync(path.join(dir,'client-snippets.json'),JSON.stringify(examples,null,2));
console.log(`Created local configuration in ${dir}. No client settings were modified. Start hub.mjs with the hub.json path. Do not distribute this private data directory.`);
