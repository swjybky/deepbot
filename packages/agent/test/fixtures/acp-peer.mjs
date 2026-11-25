import { createInterface } from 'node:readline';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const statePath = process.argv[2];
const mode = process.argv[3] ?? 'default';
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath,'utf8')) : { sessions: {}, prompts: 0 };
const save = () => writeFileSync(statePath, JSON.stringify(state));
const send = value => process.stdout.write(JSON.stringify({jsonrpc:'2.0',...value})+'\n');
const answer = (id,result) => send({id,result});
let current, permission;
const modes = {currentModeId: mode === 'unsafe' ? 'yolo' : 'default',availableModes:[{id: mode === 'unsafe' ? 'yolo' : 'default',name: mode === 'unsafe' ? 'YOLO bypass' : 'Default approval'}]};
const finish = (text) => {
 if (!current) return;
 send({method:'session/update',params:{sessionId:current.params.sessionId,update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text}}}});
 answer(current.id,{stopReason:'end_turn'}); current=null;
};
for await (const line of createInterface({input:process.stdin})) {
 const m=JSON.parse(line);
 if (m.method==='initialize') answer(m.id,{protocolVersion:1,agentCapabilities:{loadSession:mode!=='no-load'}});
 else if (m.method==='session/new') { const id='session-'+Object.keys(state.sessions).length; state.sessions[id]={cwd:m.params.cwd};save();answer(m.id,{sessionId:id,modes}); }
 else if (m.method==='session/load') {
  if (!state.sessions[m.params.sessionId]) send({id:m.id,error:{code:-32002,message:'unknown session'}});
  else { send({method:'session/update',params:{sessionId:m.params.sessionId,update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'old history must not duplicate'}}}});answer(m.id,{modes}); }
 }
 else if (m.method==='session/set_mode') answer(m.id,{});
 else if (m.method==='session/prompt') {
  current=m; state.prompts++;save(); const text=m.params.prompt.map(p=>p.text).join('');
  if(text.includes('NEED_PERMISSION')) {
   permission={path:join(state.sessions[m.params.sessionId].cwd,'artifact.txt'),type:text.includes('OPAQUE_COMMAND')?'execute':text.includes('DELETE_OPERATION')?'delete':'edit'};
   send({id:9001,method:'session/request_permission',params:{sessionId:m.params.sessionId,toolCall:{toolCallId:'tool1',title:'write fixture artifact',kind:permission.type,rawInput:{path:permission.path,content:'真实的中文产物'},locations:[{path:permission.path}]},options:[{optionId:'once',kind:'allow_once',name:'Allow once'},{optionId:'no',kind:'reject_once',name:'Reject'}]}});
  } else if(text.includes('SLOW')) setTimeout(()=>finish('慢任务完成'),300);
  else finish('ACP 真实进程已完成：中文正常');
 }
 else if (m.id===9001) {
  const allowed=m.result?.outcome?.optionId==='once';
  if(allowed) writeFileSync(permission.path,'真实的中文产物');
  finish(allowed?'已批准并写入产物':'权限拒绝，未执行');
 }
 else if(m.method==='session/cancel') { if(current) answer(current.id,{stopReason:'cancelled'});current=null; }
}
