import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const children=[];
function start(command,args){const child=spawn(command,args,{cwd:root,stdio:'inherit'});children.push(child);child.on('error',e=>{console.error(e.message);shutdown(1);});child.on('exit',code=>{if(code)shutdown(code);});return child;}
function shutdown(code=0){for(const c of children)c.kill();process.exit(code);}
process.on('SIGINT',()=>shutdown());process.on('SIGTERM',()=>shutdown());
let alive=false;try{const r=await fetch('http://127.0.0.1:8000/api/health',{signal:AbortSignal.timeout(1000)});alive=(await r.json()).modelVersion==='3.0';}catch{}
if(!alive){const python=process.platform==='win32'?'.venv/Scripts/python.exe':'.venv/bin/python';start(python,['science/server.py']);for(let i=0;i<60;i++){await new Promise(r=>setTimeout(r,500));try{const r=await fetch('http://127.0.0.1:8000/api/health');if(r.ok){alive=true;break;}}catch{}}}
if(!alive)shutdown(1);if(children.length===0)console.log('Using existing science API on 8000. Restart it after Python edits.');
start(process.execPath,['node_modules/vite/bin/vite.js',...(process.argv.includes('--production')?['preview']:[])]);
