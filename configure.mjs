import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const [directory,provider,executable]=process.argv.slice(2);
if(!directory||!['gpt','claude','deepseek','antigravity'].includes(provider)||!executable)throw Error('Usage: node configure.mjs DATA_DIR gpt|claude|deepseek|antigravity ABSOLUTE_CLI_OR_JS_PATH');
if(!path.isAbsolute(executable)||!existsSync(executable))throw Error('Provide an existing absolute executable path');
const file=path.resolve(directory,'hub.json'),config=JSON.parse(readFileSync(file,'utf8'));
const root=path.dirname(fileURLToPath(import.meta.url));
if(['deepseek','antigravity'].includes(provider)){
 if(/\.(cmd|bat)$/i.test(executable))throw Error('Provide the JS entrypoint or native executable, not a shell wrapper');
 const js=/\.[cm]?js$/i.test(executable);
 config.backends[provider]={type:provider==='deepseek'?'deepseek-harness':'antigravity',command:js?process.execPath:executable,args:js?[executable]:[]};
}else config.backends[provider]={type:'mcp-peer',command:process.execPath,args:[path.join(root,'bridges',provider,'server.mjs')],exchangeTool:provider==='gpt'?'gpt_exchange':'claude_exchange',env:{[provider==='gpt'?'RELAY_CODEX_EXE':'RELAY_CLAUDE_EXE']:executable}};
writeFileSync(file,JSON.stringify(config,null,2),{mode:0o600});console.log(`Configured ${provider}; restart the hub when no meeting is running. Login separately using the official CLI.`);
