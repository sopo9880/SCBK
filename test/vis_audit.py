# 연출 가시성 검사: 무기마다 새 도시에서 쏘고, 연출(컷신) 동안
#  - 폭발(fx.explosion / D.explode)이 화면 안에 보였는지 (건물·지형에 가리지 않고)
#  - 날아가는 발사체가 화면에 보였는지
# 를 샷별로 세어 점수를 냄.  WLIST 가 비면 모든 무기.
import json, os, time
W = json.loads(os.environ.get('WLIST', '[]'))
P = float(os.environ.get('POWER', '3'))
MAXT = float(os.environ.get('MAXT', '40'))
def fresh():
    pg.evaluate("window.__start({demo:true, name:'데모 시티', sub:'오프라인'})")
    pg.wait_for_function("window.__game && document.querySelector('#loading').hidden", timeout=300000)
    pg.evaluate("""(()=>{const g=window.__game; g.renderer.setAnimationLoop(null); g.controls.enableDamping=false; g.controls.target.set(0,g.grid.sample(0,0),0); g.camera.position.set(330,240,420); g.controls.update(); g.camera.updateMatrixWorld(); g._mouse.set(0,0);
      const T=window.THREE_V||null;
      const vis=(p)=>{ const c=g.camera; c.updateMatrixWorld(); const v={x:p.x,y:p.y,z:p.z};
        const e=c.matrixWorldInverse.elements; const x=e[0]*v.x+e[4]*v.y+e[8]*v.z+e[12], y=e[1]*v.x+e[5]*v.y+e[9]*v.z+e[13], z=e[2]*v.x+e[6]*v.y+e[10]*v.z+e[14];
        if (z > -1) return 0; const q=c.projectionMatrix.elements; const w=-z; const nx=(q[0]*x+q[8]*z)/w, ny=(q[5]*y+q[9]*z)/w;
        if (Math.abs(nx)>1.05||Math.abs(ny)>1.05) return 0;
        const o=c.position; const dx=v.x-o.x, dy=v.y-o.y, dz=v.z-o.z, L=Math.hypot(dx,dy,dz);
        const h=g.D.raycast(o,{x:dx/L,y:dy/L,z:dz/L},L); if (h && h.dist < L - Math.max(12, L*0.04)) { const i=h.info||{}; if (i.terrain||i.b||(i.chunk&&i.chunk.state===0)) return 0.5; }
        return 1; };
      window.__vis=vis;
      const rec={ shots:{}, ex:[], frames:0, projF:0, projV:0 };
      window.__rec=rec;
      const note=(p)=>{ if(!g.cine.active||!p) return; const s=g.cine.i; const r=vis(p); const k=rec.shots[s]||(rec.shots[s]={n:0,v:0,occ:0}); k.n++; if(r===1)k.v++; else if(r===0.5)k.occ++; };
      const fx=g.fx; const oe=fx.explosion.bind(fx); fx.explosion=(p,r,o)=>{ note(p); return oe(p,r,o); };
      const D=g.D; const ox=D.explode.bind(D); D.explode=(o)=>{ if(o&&o.r>8) note(o); return ox(o); };
    })()""")
STEP = """(s)=>{ const g=window.__game, A=g.arsenal, rec=window.__rec; const dt=1/30; let t=0;
  for(;t<s;t+=dt){ if(g.planetFX){ g.endPlanet(); }
    if(g.pilot) g.endPilot(true);
    if(g.cine.active) g.cine.update(dt, dt*g.cine.timeScale*g.D.timeScale); else g.controls.update();
    const ts=g.cine.active?g.cine.timeScale:1; g.simulate(dt*ts,dt*ts);
    if(g.cine.active){ rec.frames++; if(A.projectiles.length){ rec.projF++; let ok=0; for(const p of A.projectiles){ if(window.__vis(p.pos)===1){ok=1;break;} } rec.projV+=ok; } }
    if(!g.cine.active && t>2) break; }
  return t; }"""
ids = W or pg.evaluate("Object.keys(window.__game ? {} : {})")
if not W:
    fresh()
    ids = pg.evaluate("[...new Set([...document.querySelectorAll('.wcat')].flatMap(b=>{b.click(); return [...document.querySelectorAll('.wbtn')].map(x=>x.dataset.id);}))]")
out = {}
for w in ids:
    if w in ('rewind','timestop','eraser','laser','solar','carpet','gunship','finger','hoover','guided'): continue
    t0=time.time()
    fresh()
    r = pg.evaluate(f"""(()=>{{const g=window.__game,A=g.arsenal; A.power={P}; A.opts.cinematic=true; A.opts.worldEnd=false; A.current='{w}'; const h=g.pick(); g.aim=h.point; try {{ A.fire(h,g.camera.position); }} catch(e) {{ return 'ERR '+e.message; }} return g.cine.active?'cine':'nocine'; }})()""")
    if r != 'cine': print(w, r, flush=True); continue
    pg.evaluate(STEP, MAXT)
    rec = pg.evaluate("JSON.stringify(window.__rec)")
    rec = json.loads(rec)
    n = sum(s['n'] for s in rec['shots'].values()); v = sum(s['v'] for s in rec['shots'].values()); occ = sum(s['occ'] for s in rec['shots'].values())
    pv = rec['projV']/rec['projF'] if rec['projF'] else None
    out[w] = dict(n=n, v=v, occ=occ, pv=pv, shots=rec['shots'], frames=rec['frames'])
    print(w, json.dumps({'ex': f"{v}/{n}", 'occ': occ, 'proj': None if pv is None else round(pv,2), 'shots': {k:f"{s['v']}/{s['n']}" for k,s in rec['shots'].items()}}), f'{time.time()-t0:.0f}s', flush=True)
json.dump(out, open(f'{OUT}/vis_audit.json','w'))
