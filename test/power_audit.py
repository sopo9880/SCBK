# ×100 위력 검사: 세계 멸망 결말을 끈 채 무기 자체의 효과만 잼
#  aff  = 손상·붕괴된 건물 비율 (지도 전체 기준)
#  last = 마지막 폭발·파괴가 일어난 시각 (효과 지속시간)
#  vol  = 무너진 부피 비율
import json, os, time
W = json.loads(os.environ.get('WLIST', '[]'))
P = float(os.environ.get('POWER', '100'))
SECS = float(os.environ.get('SECS', '30'))
HOLD = {'laser', 'solar', 'carpet', 'gunship', 'finger', 'hoover', 'eraser'}
SKIP = {'rewind', 'timestop', 'guided'}
def fresh():
    pg.evaluate("window.__start({demo:true, name:'데모 시티', sub:'오프라인'})")
    pg.wait_for_function("window.__game && document.querySelector('#loading').hidden", timeout=300000)
    pg.evaluate("""(()=>{const g=window.__game; g.renderer.setAnimationLoop(null); g.controls.enableDamping=false; g.controls.target.set(0,g.grid.sample(0,0),0); g.camera.position.set(330,240,420); g.controls.update(); g.camera.updateMatrixWorld(); g._mouse.set(0,0);
      const D=g.D, rec={last:0,t:0}; window.__prec=rec;
      const ox=D.explode.bind(D); D.explode=(o)=>{ rec.last=rec.t; return ox(o); };
      const of=D.flatten.bind(D); D.flatten=(...a)=>{ rec.last=rec.t; return of(...a); };
      const ov=D.vaporizeBuilding.bind(D); D.vaporizeBuilding=(...a)=>{ rec.last=rec.t; return ov(...a); };
      const ob=D.blastFrom.bind(D); D.blastFrom=(...a)=>{ rec.last=rec.t; return ob(...a); };
      const os=D.sinkBuilding.bind(D); D.sinkBuilding=(...a)=>{ rec.last=rec.t; return os(...a); };
      const ol=D.launch.bind(D); D.launch=(...a)=>{ rec.last=rec.t; return ol(...a); };
    })()""")
fresh()
ids = W or pg.evaluate("[...new Set([...document.querySelectorAll('.wcat')].flatMap(b=>{b.click(); return [...document.querySelectorAll('.wbtn')].map(x=>x.dataset.id);}))]")
res = {}
first = True
for w in ids:
    if w in SKIP: continue
    t0 = time.time()
    if not first: fresh()
    first = False
    hold = w in HOLD
    r = pg.evaluate(f"""(()=>{{const g=window.__game,A=g.arsenal; A.power={P}; A.opts.cinematic=false; A.opts.worldEnd=false; A.opts.planet=false; A.current='{w}'; const h=g.pick(); g.aim=h.point; window.__h=h;
      try {{ if({str(hold).lower()}) A.holdStart(h); else A.fire(h,g.camera.position); }} catch(e) {{ return 'ERR '+e.message; }} return 'ok'; }})()""")
    if r != 'ok': print(w, r, flush=True); continue
    out = pg.evaluate(f"""(s)=>{{ const g=window.__game, A=g.arsenal, rec=window.__prec, h=window.__h; const dt=1/30;
      for(let t=0;t<s;t+=dt){{ rec.t=t; if(g.pilot) g.endPilot(true); if(g.cine.active) g.cine.stop(true);
        if({str(hold).lower()} && A._hold){{ const a=t*0.8; g.aim={{x:h.point.x+Math.cos(a)*t*25,y:h.point.y,z:h.point.z+Math.sin(a)*t*25}}; if(t>8) A.holdEnd(); }}
        g.simulate(dt,dt); }}
      const st={{}}; let aff=0, vol=0, tot=0; for(const b of g.D.buildings){{ st[b.state]=(st[b.state]||0)+1; const v=b.area*b.height; tot+=v; if(b.state!=='intact'){{ aff++; vol+= b.state==='fractured' ? v*Math.min(1,b.released/Math.max(1,b.total)) : v; }} }}
      return JSON.stringify({{aff:+(aff/g.D.buildings.length).toFixed(2), vol:+(vol/tot).toFixed(2), last:+rec.last.toFixed(1), st}}); }}""", SECS)
    res[w] = json.loads(out)
    print(w, out, f'{time.time()-t0:.0f}s', flush=True)
json.dump(res, open(f'{OUT}/power_audit.json', 'w'))
