import json
pg.evaluate("(()=>{const r=document.querySelector('#radius'); r.value=3000; r.oninput();})()")
t0=time.time()
pg.evaluate("window.__start({demo:true, name:'데모 시티', sub:'오프라인'})")
pg.wait_for_function("window.__game && document.querySelector('#loading').hidden", timeout=900000)
print('load', round(time.time()-t0,1), 's', pg.evaluate("window.__game.data.buildings.length"), 'buildings, heap MB', pg.evaluate("performance.memory ? Math.round(performance.memory.usedJSHeapSize/1e6) : -1"))
pg.evaluate("(()=>{const g=window.__game; g.controls.enableDamping=false; g.controls.target.set(0,g.grid.sample(0,0),0); g.camera.position.set(2200,1900,2600); g.controls.update();})()")
pg.wait_for_timeout(3000)
pg.screenshot(path=f'{OUT}/big_0.png', timeout=200000)
res = pg.evaluate("""(()=>{
 const g=window.__game, P=window.__PROF, D=g.D; const frames=[];
 g.onSimFrame=()=>{ frames.push(Object.assign({}, P.cur)); P.cur=Object.create(null); };
 g.arsenal.power=100; g.arsenal.opts.realNuke=true;
 const t0=performance.now();
 g.arsenal.current='nuke';
 const NUK = window.__nukeDetonate;
 return 'ok';
})()""")
# 핵 ×100 을 중심에 직접 떨어뜨림
pg.evaluate("(()=>{const g=window.__game; g._mouse.set(0,0); g.camera.updateMatrixWorld(); const h=g.pick(); g.arsenal.fire(h, g.camera.position);})()")
r = pg.evaluate("""(()=>{const g=window.__game, P=window.__PROF; const fr=[]; g.onSimFrame=()=>{ const t=(P.cur.weapons||0)+(P.cur.physics||0)+(P.cur.fx||0); fr.push(t); P.cur=Object.create(null); };
  g.simulate(9, 1/60); fr.sort((a,b)=>a-b); return JSON.stringify({frames:fr.length, med:+fr[fr.length>>1].toFixed(1), p95:+fr[Math.floor(fr.length*.95)].toFixed(1), max:+fr[fr.length-1].toFixed(1), stats:g.D.stats()});})()""")
print('nuke x100', r)
pg.evaluate("window.__game.fx.shake=0")
pg.wait_for_timeout(3000)
pg.screenshot(path=f'{OUT}/big_1.png', timeout=200000)
for l in logs[-8:]: print(l)
