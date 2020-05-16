import fs from 'fs';
import shelljs from 'shelljs';

let esm = fs.readFileSync('package.json', 'utf-8');
let cmj = JSON.stringify(JSON.parse(esm, (key, value) => (key == 'type')? 'commonjs' : value));
fs.writeFileSync('package.json', cmj);
shelljs.exec('npx jest --colors');
fs.writeFileSync('package.json', esm);