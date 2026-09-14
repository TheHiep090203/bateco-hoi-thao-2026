import fs from 'node:fs/promises';
const assets={};for(const file of ['index.html','style.css','refinements.css','app.js','live.js','entry.js','live.css'])assets['/'+file]=await fs.readFile('dist/'+file,'utf8');
let source=await fs.readFile('server/worker.mjs','utf8');source=source.replace(/^import .* from '\.\/domain\.mjs';\r?\n/m,await fs.readFile('server/domain.mjs','utf8')+'\n');
// Fail loudly: a silent no-op replace used to ship a Worker that could not resolve domain.mjs.
if(source.includes("from './domain.mjs'"))throw Error('Không nhúng được server/domain.mjs vào worker. Kiểm tra dòng import ở đầu server/worker.mjs.');
source='const assets='+JSON.stringify(assets)+';\n'+source;
await fs.mkdir('dist/server',{recursive:true});await fs.writeFile('dist/server/index.js',source);await fs.mkdir('dist/.openai',{recursive:true});await fs.copyFile('.openai/hosting.json','dist/.openai/hosting.json');console.log('Built Worker with existing website and D1 scoreboard.');
