import json, time, os
PS = json.loads(os.environ.get("PS", "[1,10,100]"))
def fresh(cam, radius=900):
    pg.evaluate(f"(()=>{{const r=document.querySelector('#radius'); r.value={radius}; r.oninput&&r.oninput();}})()")
    pg.evaluate("window.__start({demo:true, name:'데모 시티', sub:'오프라인'})")
    pg.wait_for_function("window.__game && document.querySelector('#loading').hidden", timeout=300000)
    pg.evaluate(f"""(()=>{{const g=window.__game; g.controls.enableDamping=false; g.controls.target.set(0,g.grid.sample(0,0),0); g.camera.position.set({cam}); g.controls.update(); g._mouse.set(0,0); g.camera.updateMatrixWorld();}})()""")
def step(s):
    return pg.evaluate(f"""(()=>{{const g=window.__game; g.renderer.setAnimationLoop(null); const dt=1/30; let mx=0; for(let t=0;t<{s};t+=dt){{ const t0=performance.now(); if(g.cine.active) g.cine.update(dt, dt*g.cine.timeScale*g.D.timeScale); else g.controls.update(); const ts=g.cine.active?g.cine.timeScale:1; g.simulate(dt*ts,dt*ts); g._applyWeather(dt); mx=Math.max(mx,performance.now()-t0);}} g.fx.shake=0; g.sky.position.copy(g.camera.position); g.composer.render();
      const st={{}}; for(const b of g.D.buildings) st[b.state]=(st[b.state]||0)+1;
      return JSON.stringify({{maxMs:Math.round(mx), cine:g.cine.active, doom:+g._doomK.toFixed(2), far:g.camera.far, cam:g.camera.position.toArray().map(Math.round), st, loose:g.D.loose.size, dyn:g.D.dynamic.size}});}})()""")
def snap(name): pg.screenshot(path=f'{OUT}/{name}.png', timeout=200000)
for P in PS:
    fresh('700,420,900')
    print('P', P, pg.evaluate(f"(()=>{{const g=window.__game, A=g.arsenal; A.power={P}; A.opts.realNuke=true; A.opts.cinematic=true; const N=A.nukeHit({{x:0,y:0,z:0}}); return JSON.stringify(N);}})()"))
    for i, s in enumerate([0.4, 2.0, 5.0, 10.0, 12.0]):
        print('  ', step(s)); snap(f'n3_{P}_{i}')
for l in logs[-10:]: print(l)
