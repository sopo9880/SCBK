# ×100 세계 멸망 결말 점검: 무기마다 새 도시에서 위력 100으로 쏘고 25초 진행
import json, os, time
W = json.loads(os.environ.get('WLIST', '[]'))
SHOT = os.environ.get('SHOT', '1') == '1'
for w in W:
    t0 = time.time()
    pg.evaluate("window.__start({demo:true, name:'데모 시티', sub:'오프라인'})")
    pg.wait_for_function("window.__game && document.querySelector('#loading').hidden", timeout=300000)
    r = pg.evaluate("""(w)=>{ const g=window.__game, A=g.arsenal; g.renderer.setAnimationLoop(null);
      g.controls.enableDamping=false; g.controls.target.set(0,g.grid.sample(0,0),0); g.camera.position.set(700,420,900); g.controls.update(); g.camera.updateMatrixWorld(); g._mouse.set(0,0);
      A.power=100; A.opts.cinematic=true; A.opts.realNuke=true; A.opts.planet=true; g.cfg.planet=true; A.current=w; const h=g.pick(); g.aim=h.point; window.__planetSeen=false; window.__mx=0;
      try { if(A.isHold()){ A.holdStart(h); for(let i=0;i<40;i++){ g.aim={x:h.point.x+i*3,y:h.point.y,z:h.point.z}; A.update(1/30, g.aim); g.D.update(1/30);} A.holdEnd(); } else A.fire(h, g.camera.position); } catch(e){ return 'ERR '+e.stack.slice(0,300); }
      return 'ok'; }""", w)
    if r != 'ok': print(w, r, flush=True); continue
    out = {}
    for i, secs in enumerate([9, 16]):
        res = pg.evaluate("""(s)=>{ const g=window.__game; const dt=1/30; try { for(let t=0;t<s;t+=dt){ const t0=performance.now();
            if(g.planetFX){ window.__planetSeen=g.planetFX.kind; g.planetFX.update(dt*3); if(g.planetFX.done) g.endPlanet(); continue; }
            if(g.cine.active) g.cine.update(dt, dt*g.cine.timeScale*g.D.timeScale); else g.controls.update();
            const ts=g.cine.active?g.cine.timeScale:1; g.simulate(dt*ts,dt*ts); g._applyWeather(dt); g.world.update(dt); window.__mx=Math.max(window.__mx, performance.now()-t0); }
          } catch(e) { return 'ERR '+e.stack.slice(0,400); }
          g.fx.shake=0; g.sky.position.copy(g.camera.position); if(g.planetFX) g.planetFX.render(); else g.composer.render();
          const st={}; for(const b of g.D.buildings) st[b.state]=(st[b.state]||0)+1;
          return JSON.stringify({planet:window.__planetSeen, doom:+(g._doomK||0).toFixed(2), st, mx:Math.round(window.__mx), err:g.phys.lastErr||null}); }""", secs)
        if SHOT: pg.screenshot(path=f'{OUT}/x_{w}_{i}.png', timeout=200000)
        out[i] = res
    print(w, out[1], f'{time.time()-t0:.0f}s', flush=True)
errs = [l for l in logs if 'error' in l.lower()]
for l in errs[-10:]: print(l)
