const s={type:'string'};
function tool(name,description,properties,required,readOnly=false){return {name,description,inputSchema:{type:'object',properties,required,additionalProperties:false},annotations:{readOnlyHint:readOnly,destructiveHint:false,openWorldHint:!readOnly}};}
const room={room_id:s},req={request_id:{type:'string',description:'Unique mutation ID. Reuse only with identical arguments after uncertain outcomes.'}};
export const tools=[
 tool('council_status','List configured automatic peers; configuration is not proof of authentication.',{},[],true),
 tool('room_create','Create a shared local meeting after user authorizes AI collaboration.',{title:s,goal:s,mode:{type:'string',enum:['discussion','review']},...req},['title','goal','mode','request_id']),
 tool('room_join','Join a known room. All configured clients on this machine are trusted collaborators.',{...room,role:s,...req},['room_id','role','request_id']),
 tool('room_read','Read transcript after a cursor. Reading an inbox does not automatically wake an idle AI.',{...room,after:{type:'integer',minimum:0}},['room_id'],true),
 tool('room_say','Post your contribution under your configured client identity. Share only task material authorized by the user.',{...room,message:s,...req},['room_id','message','request_id']),
 tool('room_run','Owner starts a bounded automatic backend discussion. Hub continues without user wake-ups. Requires installed, authenticated configured backends. In review mode first participant writes/revises and remaining participants review. Poll job_status until terminal status, then summarize the real transcript.',{...room,participants:{type:'array',items:s,minItems:2,maxItems:4},rounds:{type:'integer',minimum:1,maximum:6},seed:s,...req},['room_id','participants','rounds','seed','request_id']),
 tool('job_status','Read background meeting progress. completed means round limit reached, not unanimous approval.',{job_id:s},['job_id'],true),
 tool('job_cancel','Owner stops this plugin-owned background meeting. Preserves all transcript messages and does not affect unrelated sessions.',{job_id:s,...req},['job_id','request_id']),
 tool('room_close','Owner closes the room after work finishes. Preserves transcript; deletes nothing.',{...room,...req},['room_id','request_id'])
];
export function validateCall(name,args){
 const t=tools.find(t=>t.name===name);if(!t)throw Error('Unknown tool');
 if(!args||typeof args!=='object'||Array.isArray(args))throw Error('Arguments must be an object');
 for(const key of t.inputSchema.required)if(!Object.hasOwn(args,key))throw Error('Missing '+key);
 for(const [key,value] of Object.entries(args)){
  const schema=t.inputSchema.properties[key];if(!schema)throw Error('Unexpected argument '+key);
  if(schema.type==='string'&&typeof value!=='string')throw Error('Invalid '+key);
  if(schema.type==='integer'&&!Number.isInteger(value))throw Error('Invalid '+key);
  if(schema.type==='array'&&(!Array.isArray(value)||value.some(x=>typeof x!=='string')))throw Error('Invalid '+key);
 }
}
