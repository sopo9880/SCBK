import json
pg.evaluate("window.__start({demo:true, name:'데모 시티', sub:'오프라인'})")
pg.wait_for_function("window.__game && document.querySelector('#loading').hidden", timeout=300000)
ids = pg.evaluate("[...document.querySelectorAll('.wcat')].map(b=>b.dataset.cat)")
print('cats', ids, 'weapons in bar', pg.evaluate("document.querySelectorAll('.wbtn').length"))
res = pg.evaluate("""(()=>{
 const g=window.__game, A=g.arsenal, out=[];
 const all=['bomb','missile','cluster','bunker','carpet','railgun','napalm','laser','meteor','rod','quake','tornado','sinkhole','tsunami','blackhole','antigrav','ball','stomp','nuke','bomber','icbm'];
 g.controls.enableDamping=false; g.controls.target.set(0,g.grid.sample(0,0),0); g.camera.position.set(300,250,380); g.controls.update();
 g._mouse.set(0,0);
 for(const w of all){
   try{
     A.current=w; const h=g.pick(); g.aim=h.point;
     if(A.isHold()){ A.holdStart(h); for(let i=0;i<20;i++){ g.aim={x:h.point.x+i*8,y:h.point.y,z:h.point.z}; g.simulate(1/30,1/30);} A.holdEnd(); }
     else A.fire(h, g.camera.position);
     g.simulate(3, 1/30);
     if (g.cine.active) { g.cine.skip(); }
     g.simulate(1, 1/30);
     out.push([w,'ok',A.active.length,A.projectiles.length, g.D.stats().score]);
   }catch(e){ out.push([w,'ERR', String(e && e.stack || e).slice(0,300)]); }
 }
 return JSON.stringify(out);
})()""")
for r in json.loads(res): print(r)
for l in logs[-15:]: print(l)
