import readline from 'node:readline';
const [provider,scenario]=process.argv.slice(2);
const emit=x=>process.stdout.write(JSON.stringify(x)+'\n');
if(provider==='antigravity'){
 emit({event:'init',conversation_id:'fixture-conversation'});let turns=0;
 readline.createInterface({input:process.stdin}).on('line',line=>{
  const event=JSON.parse(line);if(event.event!=='user')process.exit(8);turns++;
  if(scenario==='timeout')return;
  if(scenario==='tool'){emit({event:'step_update',step_update:{step_type:'tool'}});return;}
  emit({event:'step_update',step_update:{step_type:'agent_response',state:'ACTIVE',text_delta:'WRONG PARTIAL'}});
  if(scenario==='partial-exit'){process.exit(0);return;}
  const result={event:'result',result:{conversation_id:scenario==='mismatch'?'wrong':'fixture-conversation',num_turns:turns,status:scenario==='failed'?'ERROR':'SUCCESS',response:`完整回复青松 ${turns}`}};
  // Split within the UTF-8 stream: decoder must preserve multibyte characters.
  const bytes=Buffer.from(JSON.stringify(result)+'\n');let i=0;
  const next=()=>{if(i<bytes.length){process.stdout.write(bytes.subarray(i,i+7));i+=7;setImmediate(next);}};next();
 });
}else{
 let input='';for await(const chunk of process.stdin)input+=chunk;
 JSON.parse(input);const index=process.argv.indexOf('--session-id');
 const session=index<0?'session-fixture':process.argv[index+1];
 emit({type:'session',sessionId:scenario==='mismatch'&&index>=0?'session-wrong':session});
 if(scenario==='timeout')setInterval(()=>{},1000);
 else if(scenario==='tool')emit({type:'tool_call',tool:'read'});
 else {
  emit({type:'text',text:'TRUNCATED PREVIEW',truncated:true});
  if(scenario==='partial-exit')process.exit(0);
  emit({type:'final',sessionId:session,reason:scenario==='credentials'?{kind:'error',error:{code:'MISSING_CREDENTIAL',message:'private provider diagnostic'}}:{kind:scenario==='failed'?'error':'completed'},text:index<0?'完整青松首轮':'记得青松，已续接'});
  if(scenario==='exit-failure')process.exitCode=1;
 }
}
