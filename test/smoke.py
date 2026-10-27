import json, time, os
WL = json.loads(os.environ.get('WLIST', '[]'))
pg.evaluate("window.__start({demo:true, name:'데모 시티', sub:'오프라인'})")
pg.wait_for_function("window.__game && document.querySelector('#loading').hidden", timeout=300000)
cats = pg.evaluate("[...document.querySelectorAll('.wcat')].map(b=>b.dataset.cat)")
allw = []
for c in cats:
    pg.evaluate(f"document.querySelector('.wcat[data-cat=\"{c}\"]').click()")
    allw += pg.evaluate("[...document.querySelectorAll('.wbtn')].map(b=>b.dataset.id)")
print('cats', cats, 'weapons', len(allw))
order = [w for w in allw if w != 'rewind'] + ['rewind']
if WL: order = [w for w in order if w in WL]
for w in order:
    t0 = time.time()
    r = pg.evaluate("""(w)=>{
     const g=window.__game, A=g.arsenal;
     try{
       if (g.cine.active) g.cine.stop(true);
       g.controls.enableDamping=false; g.controls.target.set(0,g.grid.sample(0,0),0); g.camera.position.set(300,250,380); g.controls.update(); g.camera.updateMatrixWorld();
       g._mouse.set(0,0); A.power=1.5; A.opts.cinematic=true; A.opts.realNuke=true;
       A.current=w; const h=g.pick(); g.aim=h.point;
       let mx=0;
       const step=(s)=>{ for(let t=0;t<s;t+=1/30){ const t0=performance.now(); if(g.cine.active) g.cine.update(1/30, g.cine.timeScale*g.D.timeScale/30); const ts=g.cine.active?g.cine.timeScale:1; g.simulate(ts/30, ts/30); g._applyWeather(1/30); mx=Math.max(mx, performance.now()-t0);} };
       if(A.isHold()){ A.holdStart(h); for(let i=0;i<40;i++){ g.aim={x:h.point.x+i*3,y:h.point.y,z:h.point.z}; step(1/30);} A.holdEnd(); }
       else A.fire(h, g.camera.position);
       step(4);
       const cine=g.cine.active; if (cine) g.cine.skip();
       step(1.5);
       const st={}; for(const b of g.D.buildings) st[b.state]=(st[b.state]||0)+1;
       return JSON.stringify([w,'ok',{act:A.active.length,proj:A.projectiles.length,score:g.D.stats().score,dyn:g.D.dynamic.size,loose:g.D.loose.size,cine,maxMs:Math.round(mx),st,err:g.phys.lastErr||null}]);
     }catch(e){ return JSON.stringify([w,'ERR', String(e && e.stack || e).slice(0,500)]); }
    }""", w)
    print(r, f'{time.time()-t0:.1f}s', flush=True)
pg.evaluate("window.__game.renderer.setAnimationLoop(null); window.__game.composer.render()")
pg.screenshot(path=f'{OUT}/smoke_end.png')
for l in logs[-20:]: print(l)
