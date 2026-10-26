import json, time, sys
W = json.loads(os.environ.get('WLIST', '[]'))
def fresh():
    pg.evaluate("window.__start({demo:true, name:'데모 시티', sub:'오프라인'})")
    pg.wait_for_function("window.__game && document.querySelector('#loading').hidden", timeout=300000)
    pg.evaluate("""(()=>{const g=window.__game; g.renderer.setAnimationLoop(null); g.controls.enableDamping=false; g.controls.target.set(0,g.grid.sample(0,0),0); g.camera.position.set(330,240,420); g.controls.update(); g.camera.updateMatrixWorld(); g._mouse.set(0,0);})()""")
def step(s, aimdx=0):
    return pg.evaluate("""([s,dx])=>{const g=window.__game, A=g.arsenal; let mx=0; for(let t=0;t<s;t+=1/30){ const t0=performance.now(); if(g.cine.active) g.cine.update(1/30, g.cine.timeScale*g.D.timeScale/30); else g.controls.update(); const ts=g.cine.active?g.cine.timeScale:1; if(A._hold&&dx){ g.aim={x:g.aim.x+dx/30,y:g.aim.y,z:g.aim.z}; } g.simulate(ts/30, ts/30); g._applyWeather(1/30); g.world.update(1/30); mx=Math.max(mx,performance.now()-t0);} g.fx.shake=0; g.sky.position.copy(g.camera.position); g.composer.render(); const fade=document.getElementById('cineFade'); if(fade) fade.style.opacity=g.cine.active?String(g.cine.fade||0):'0'; return Math.round(mx);}""", [s, aimdx])
def snap(n): pg.screenshot(path=f'{OUT}/v_{n}.png', timeout=180000)
for spec in W:
    w, times = spec[0], spec[1]
    P = spec[2] if len(spec) > 2 else 3
    if not (len(spec) > 3 and spec[3] == 'keep'): fresh()
    pg.evaluate(f"""(()=>{{const g=window.__game, A=g.arsenal; A.power={P}; A.opts.cinematic=true; A.opts.realNuke=true; A.current='{w}'; const h=g.pick(); g.aim=h.point; window.__h=h; if(A.isHold()) A.holdStart(h); else A.fire(h, g.camera.position);}})()""")
    for i, t in enumerate(times):
        ms = step(t, 25)
        snap(f'{w}_{i}')
        print(w, i, 'maxMs', ms, pg.evaluate("(()=>{const g=window.__game; return JSON.stringify({cine:g.cine.active, cap:document.getElementById('cineCap').textContent, dyn:g.D.dynamic.size, act:g.arsenal.active.length})})()"), flush=True)
    pg.evaluate("window.__game.arsenal.holdEnd()")
for l in logs[-12:]: print(l)
