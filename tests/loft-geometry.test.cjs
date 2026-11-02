const assert = require('node:assert/strict');
require('../loft-geometry.js');
const g = global.LoftGeometry;
assert.equal(g.validOutline(g.rectangle()), true);
assert.equal(g.validOutline([{x:5,y:5},{x:95,y:95},{x:5,y:95},{x:95,y:5}]), false);
assert.equal(g.rectFits({x:10,y:10,w:20,h:20},g.rectangle()), true);
assert.equal(g.rectFits({x:0,y:10,w:20,h:20},g.rectangle()), false);
assert.equal(g.rectFits({x:5,y:5,w:90,h:90},g.rectangle()), true);
assert.equal(g.rectFits({x:10,y:10,w:1,h:20},g.rectangle()), false);
const u = [{x:5,y:5},{x:40,y:5},{x:40,y:60},{x:60,y:60},{x:60,y:5},{x:95,y:5},{x:95,y:95},{x:5,y:95}];
assert.equal(g.validOutline(u), true);
assert.equal(g.rectFits({x:10,y:10,w:80,h:80},u), false, 'sections cannot cross a recess even when their corners are inside');
assert.equal(g.rectFits({x:10,y:65,w:80,h:20},u), true);
console.log('Outline validation, boundary containment and concave-loft checks passed.');

