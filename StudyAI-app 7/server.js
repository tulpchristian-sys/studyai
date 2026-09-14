import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const PUBLIC=path.join(__dirname,'public');
const DATA=path.join(__dirname,'data');
const DB=path.join(DATA,'db.json');
const PORT=Number(process.env.PORT||3000);
const MODEL=process.env.OPENAI_MODEL||'gpt-5.6-luna';
const sessions=new Map();

async function init(){try{await fs.access(DB)}catch{await fs.writeFile(DB,JSON.stringify({users:[],sessions:[],materials:[],attempts:[],plans:[],errors:[]},null,2))}}
async function db(){return JSON.parse(await fs.readFile(DB,'utf8'))}
async function save(d){await fs.writeFile(DB,JSON.stringify(d,null,2))}
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'});res.end(JSON.stringify(data))}
function body(req){return new Promise((resolve,reject)=>{let s='';req.on('data',c=>{s+=c;if(s.length>8e6)req.destroy()});req.on('end',()=>{try{resolve(s?JSON.parse(s):{})}catch{resolve({})}});req.on('error',reject)})}
function token(){return crypto.randomBytes(24).toString('hex')}
function hash(p){return crypto.createHash('sha256').update(p).digest('hex')}
async function user(req){const t=(req.headers.authorization||'').replace('Bearer ',''); if(!t)return null; const s=sessions.get(t); if(!s)return null; const d=await db();return d.users.find(u=>u.id===s.userId)||null}
async function ai(messages, opts={}){
 if(!process.env.OPENAI_API_KEY) return {text:'AI is nog niet verbonden. Voeg OPENAI_API_KEY toe aan .env om de echte StudyAI-tutor en materiaal-analyse te activeren.',demo:true};
 const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'Authorization':`Bearer ${process.env.OPENAI_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({model:opts.model||MODEL,input:messages,instructions:'Je bent StudyAI, een Nederlandse persoonlijke bijlesdocent voor middelbare scholieren van 12-18 jaar. Leg duidelijk, motiverend en leeftijdsgericht uit. Geef bij leerhulp niet onnodig direct het antwoord; begeleid de leerling met stappen. Antwoord in het Nederlands.',max_output_tokens:opts.max_output_tokens||1800})});
 if(!r.ok) throw new Error(await r.text()); const j=await r.json(); return {text:j.output_text||JSON.stringify(j),id:j.id};
}
async function uploadToOpenAI(name,mime,buf){const fd=new FormData();fd.append('purpose','user_data');fd.append('file',new Blob([buf],{type:mime}),name);const r=await fetch('https://api.openai.com/v1/files',{method:'POST',headers:{Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},body:fd});if(!r.ok)throw new Error(await r.text());return r.json()}
async function route(req,res){
 const url=new URL(req.url,`http://${req.headers.host}`); const p=url.pathname; const method=req.method;
 if(method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type,Authorization'});return res.end()}
 if(p.startsWith('/api/')){
  try{
   if(p==='/api/register'&&method==='POST'){const b=await body(req);const d=await db();if(d.users.some(u=>u.email===b.email))return json(res,409,{error:'Email bestaat al'});const u={id:crypto.randomUUID(),name:b.name||'Leerling',email:b.email,password:hash(b.password||''),class:b.class||'3 havo',plan:'free',xp:0,streak:0,subjects:b.subjects||['Wiskunde','Engels','Geschiedenis','Frans'],createdAt:new Date().toISOString()};d.users.push(u);await save(d);const t=token();sessions.set(t,{userId:u.id});return json(res,200,{token:t,user:safe(u)})}
   if(p==='/api/login'&&method==='POST'){const b=await body(req);const d=await db();const u=d.users.find(x=>x.email===b.email&&x.password===hash(b.password||''));if(!u)return json(res,401,{error:'Onjuiste gegevens'});const t=token();sessions.set(t,{userId:u.id});return json(res,200,{token:t,user:safe(u)})}
   if(p==='/api/me'&&method==='GET'){const u=await user(req);if(!u)return json(res,401,{error:'Niet ingelogd'});return json(res,200,{user:safe(u)})}
   const u=await user(req); if(!u)return json(res,401,{error:'Log eerst in'});
   if(p==='/api/dashboard'&&method==='GET'){const d=await db();return json(res,200,{user:safe(u),materials:d.materials.filter(x=>x.userId===u.id),attempts:d.attempts.filter(x=>x.userId===u.id).slice(-20),errors:d.errors.filter(x=>x.userId===u.id),plans:d.plans.filter(x=>x.userId===u.id)})}
   if(p==='/api/ai/chat'&&method==='POST'){const b=await body(req);const r=await ai([{role:'user',content:[{type:'input_text',text:b.message||''}]}]);return json(res,200,r)}
   if(p==='/api/ai/generate'&&method==='POST'){const b=await body(req);const prompt=`Maak voor een middelbare scholier een ${b.type||'quiz'} over deze stof. Geef JSON zonder markdown met de structuur {"title":"","items":[...]} . Bij flashcards: items [{front,back,difficulty}]. Bij quiz: items [{question,options,answer,explanation}]. Bij plan: items [{day,title,tasks,duration}]. Stof:\n${b.text||''}`;const r=await ai([{role:'user',content:[{type:'input_text',text:prompt}]}],{max_output_tokens:5000});let data=r.text;try{data=JSON.parse(data)}catch{}return json(res,200,{data,raw:r.text})}
   if(p==='/api/materials'&&method==='POST'){const b=await body(req);let text=b.text||'';let fileId=null;if(b.dataUrl&&process.env.OPENAI_API_KEY){const m=(b.dataUrl.match(/^data:([^;]+);base64,(.*)$/)||[]);if(m){const buf=Buffer.from(m[2],'base64');const f=await uploadToOpenAI(b.name||'materiaal',m[1],buf);fileId=f.id;const r=await ai([{role:'user',content:[{type:'input_text',text:`Analyseer dit lesmateriaal en geef een korte Nederlandse samenvatting, onderwerpen, begrippen en 5 leerdoelen.`},{type:'input_file',file_id:fileId}]}],{max_output_tokens:3000});text=r.text}}const d=await db();const mat={id:crypto.randomUUID(),userId:u.id,name:b.name||'Nieuw materiaal',text:text.slice(0,30000),fileId,createdAt:new Date().toISOString()};d.materials.push(mat);await save(d);return json(res,200,{material:mat})}
   if(p==='/api/attempts'&&method==='POST'){const b=await body(req);const d=await db();const a={id:crypto.randomUUID(),userId:u.id,type:b.type||'quiz',score:Number(b.score||0),subject:b.subject||'',topic:b.topic||'',createdAt:new Date().toISOString()};d.attempts.push(a);u.xp=(u.xp||0)+Math.round(a.score);u.streak=Math.max(1,u.streak||0);if(b.error){d.errors.push({id:crypto.randomUUID(),userId:u.id,subject:a.subject,topic:a.topic,question:b.error,createdAt:new Date().toISOString()})}await save(d);return json(res,200,{attempt:a,user:safe(u)})}
   if(p==='/api/plans'&&method==='POST'){const b=await body(req);const d=await db();let plan;if(process.env.OPENAI_API_KEY){const r=await ai([{role:'user',content:[{type:'input_text',text:`Maak een persoonlijk studieplan in JSON voor ${b.subject||'een vak'}, toets op ${b.date||'onbekend'}, ${b.minutes||30} minuten per dag, niveau ${u.class}. Onderwerp: ${b.topic||''}. Structuur {"title":"","items":[{"day":"","title":"","tasks":[],"duration":0}]}` }]}],{max_output_tokens:3500});try{plan=JSON.parse(r.text)}catch{plan={title:'Persoonlijk plan',raw:r.text}}}else plan={title:`${b.subject||'Vak'} toetsvoorbereiding`,items:[{day:'Vandaag',title:'Theorie',tasks:['Lees de kernuitleg','Maak 10 flashcards'],duration:Number(b.minutes||30)},{day:'Morgen',title:'Oefenen',tasks:['Maak 10 basisvragen','Herhaal fouten'],duration:Number(b.minutes||30)},{day:'Daarna',title:'Oefentoets',tasks:['Maak een korte toets','Bekijk je fouten'],duration:Number(b.minutes||30)}]};const pl={id:crypto.randomUUID(),userId:u.id,...plan,createdAt:new Date().toISOString()};d.plans.push(pl);await save(d);return json(res,200,{plan:pl})}
   if(p==='/api/checkout'&&method==='POST'){const b=await body(req);u.plan=b.plan||'go';const d=await db();await save(d);return json(res,200,{success:true,user:safe(u),message:'Demo-upgrade voltooid. Koppel Stripe voor echte betalingen.'})}
   return json(res,404,{error:'Niet gevonden'});
  }catch(e){return json(res,500,{error:e.message})}
 }
 let file=p==='/'?'/index.html':p;file=path.normalize(path.join(PUBLIC,file));if(!file.startsWith(PUBLIC))return json(res,403,{error:'Forbidden'});try{const data=await fs.readFile(file);const ext=path.extname(file);const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml'};res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream'});res.end(data)}catch{res.writeHead(404);res.end('Not found')}
}
function safe(u){const {password,...x}=u;return x}
await init();http.createServer(route).listen(PORT,()=>console.log(`StudyAI draait op http://localhost:${PORT}`));
