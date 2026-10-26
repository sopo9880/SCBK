import json
def fresh(cam):
    pg.evaluate("window.__start({demo:true, name:'데모 시티', sub:'오프라인'})")
    pg.wait_for_function("window.__game && document.querySelector('#loading').hidden", timeout=300000)
    pg.evaluate(f"""(()=>{{const g=window.__game; g.controls.enableDamping=false; g.controls.target.set(0,g.grid.sample(0,0),0); g.camera.position.set({cam}); g.controls.update(); g._mouse.set(0,0); g.camera.updateMatrixWorld();}})()""")
def fire(w, opts, aimAt='0,0'):
    return pg.evaluate(f"""(()=>{{const g=window.__game, A=g.arsenal; A.current='{w}'; A.power=3; Object.assign(A.opts,{json.dumps(opts)}); const h=g.pick(); A.fire(h,g.camera.position); return [g.cine.active, Math.round(h.point.x), Math.round(h.point.z)];}})()""")
def step(s):
    return pg.evaluate(f"""(()=>{{const g=window.__game; g.renderer.setAnimationLoop(null); const dt=1/30; for(let t=0;t<{s};t+=dt){{ if(g.cine.active) g.cine.update(dt); const ts=g.cine.active?g.cine.timeScale:1; g.simulate(dt*ts,dt*ts);}} g.fx.shake=0; g.composer.render(); return JSON.stringify({{cine:g.cine.active, cap:document.getElementById('cineCap').textContent, score:g.D.stats().score}});}})()""")
def snap(name):
    pg.screenshot(path=f'{OUT}/{name}.png', timeout=200000)
fresh('420,330,520'); print('icbm', fire('icbm', {'realNuke': True, 'cinematic': True, 'mirv': True}))
for i, s in enumerate([9.5, 6.8, 2.2, 2.0, 6.0]):
    print('  ', step(s)); snap(f'm_icbm_{i}')
for l in logs[-10:]: print(l)
