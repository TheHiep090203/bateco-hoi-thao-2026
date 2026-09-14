import fs from 'node:fs/promises';
const assets={};for(const file of ['index.html','style.css','refinements.css','app.js','live.js','admin.html','admin.js','live.css'])assets['/'+file]=await fs.readFile('dist/'+file,'utf8');
let source=await fs.readFile('server/worker.mjs','utf8');source=source.replace("import { allianceData, sportData, standings, validateResult } from './domain.mjs';",await fs.readFile('server/domain.mjs','utf8'));source='const assets='+JSON.stringify(assets)+';\n'+source;
await fs.mkdir('dist/server',{recursive:true});await fs.writeFile('dist/server/index.js',source);await fs.mkdir('dist/.openai',{recursive:true});await fs.copyFile('.openai/hosting.json','dist/.openai/hosting.json');console.log('Built Worker with existing website and D1 scoreboard.');
