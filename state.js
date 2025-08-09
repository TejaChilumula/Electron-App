const fs = require('fs');
const path = require('path');

function loadState(userDataPath){
  const p = path.join(userDataPath, 'state.json');
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}
function saveState(userDataPath, s){
  const p = path.join(userDataPath, 'state.json');
  fs.writeFileSync(p, JSON.stringify(s, null, 2));
}
module.exports = { loadState, saveState };
