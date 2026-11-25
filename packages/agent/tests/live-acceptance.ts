import { mkdtemp,readFile,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DeepBotApp } from '../src/runtime/app.ts';
import { createConfiguredModelRuntime } from '../src/runtime/model-config.ts';
import type { Message } from '../src/protocol.ts';
const dir=await mkdtemp(join(tmpdir(),'deepbot-live-'));
const events: Message[]=[];
const runtime=await createConfiguredModelRuntime();
const app=await DeepBotApp.open({dataDir:join(dir,'state'),...runtime,debounceMs:100,tickMs:100,emit:e=>{if(e.type==='snapshot'){const d=e.snapshot;const last=d.messages.at(-1);if(last&&!events.some(x=>x.id===last.id)){events.push(last);console.log(JSON.stringify({author:last.author.kind,text:last.text,kind:last.kind}));}for(const w of d.works)console.log(JSON.stringify({work:w.id,phase:w.phase,progress:w.progress}));}}});
async function waitFor(predicate:()=>Promise<boolean>,timeout=180000){const end=Date.now()+timeout;while(Date.now()<end){if(await predicate())return;await new Promise(r=>setTimeout(r,250));}throw new Error('live acceptance timeout');}
try{
 await app.command({type:'settings.update',requestId:'settings',settings:{connectedFolders:[dir]}});
 await app.command({type:'message.send',requestId:'greet',botId:'xiaocai',threadId:'dm:xiaocai',text:'你好，我叫验收员。请用一句中文回答，包含我的名字。'});
 await waitFor(async()=> (await app.ledger()).data.messages.some(m=>m.author.kind==='bot'&&m.text.includes('验收员')));
 await app.command({type:'message.send',requestId:'file',botId:'xiaocai',threadId:'dm:xiaocai',text:`请你自己来实际完成：在已连接工作目录 ${dir} 创建 acceptance.txt，精确内容为“DeepBot 内部执行成功：42”。使用 Python 计算 6*7 后再写入，读回验证，登记文件产物并验收交付。必须后台工作，立即开始。`});
 await waitFor(async()=>(await app.ledger()).data.works.some(w=>w.state==='open'));
 await app.command({type:'message.send',requestId:'during',botId:'xiaocai',threadId:'dm:xiaocai',text:'后台继续工作。你还记得我叫什么吗？只回复名字。'});
 await waitFor(async()=>(await app.ledger()).data.works.some(w=>w.outcome==='done'),240000);
 const content=await readFile(join(dir,'acceptance.txt'),'utf8');if(content.trim()!=='DeepBot 内部执行成功：42')throw new Error('file mismatch: '+content);
 const l=await app.ledger();
 await writeFile(join(dir,'acceptance.json'),JSON.stringify({model:runtime.modelId,provider:runtime.provider,dir,content,data:l.data,reports:l.reports},null,2));
 console.log(JSON.stringify({success:true,artifact:join(dir,'acceptance.json'),messages:l.data.messages.length,works:l.data.works.map(w=>({id:w.id,phase:w.phase}))}));
}finally{await app.close();}
process.exit(0);
