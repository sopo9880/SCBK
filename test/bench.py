# 벤치마크: 데모 시티에서 큰 폭발과 핵 직후 프레임별 CPU 시간(렌더 제외) 측정
import json
pg.evaluate("(()=>{const r=document.querySelector('#radius'); r.value=900; r.oninput();})()")
pg.evaluate("window.__start({demo:true, name:'데모 시티', sub:'오프라인'})")
pg.wait_for_function("window.__game && document.querySelector('#loading').hidden", timeout=300000)
res = pg.evaluate("""(()=>{
 const g=window.__game, P=window.__PROF, D=g.D; g.arsenal.power=2.13; g.arsenal.opts.realNuke=false;
 const frames=[];
 g.onSimFrame=()=>{ frames.push(Object.assign({}, P.cur)); P.cur=Object.create(null); };
 const run=(label, setup, secs)=>{
   frames.length=0; setup(); const t0=performance.now(); g.simulate(secs, 1/60); const total=performance.now()-t0;
   const tot=frames.map(f=>Object.values(f).reduce((a,b)=>a+b,0)); const sorted=[...tot].sort((a,b)=>a-b);
   const keys={}; for(const f of frames) for(const k in f){ keys[k]=keys[k]||[]; keys[k].push(f[k]); }
   const sum=Object.fromEntries(Object.entries(keys).map(([k,v])=>[k,{avg:+(v.reduce((a,b)=>a+b,0)/frames.length).toFixed(1), max:+Math.max(...v).toFixed(1)}]));
   return {label, frames:frames.length, med:+sorted[sorted.length>>1].toFixed(1), p95:+sorted[Math.floor(sorted.length*0.95)].toFixed(1), max:+sorted[sorted.length-1].toFixed(1), worst5:tot.map((v,i)=>[i,+v.toFixed(0)]).sort((a,b)=>b[1]-a[1]).slice(0,5), parts:sum, stats:D.stats()};
 };
 const out=[];
 const b=[...g.data.buildings].sort((a,c)=>c.height-a.height)[0];
 out.push(run('big bomb x3', ()=>g.arsenal.blast({x:b.cx,y:b.baseY+b.height*0.5,z:b.cz}, 60, 40, {vap:6}), 3));
 out.push(run('nuke', ()=>g.arsenal.nukeHit({x:0,y:g.grid.sample(0,0),z:0}), 5));
 out.push(run('aftermath', ()=>{}, 3));
 return JSON.stringify(out);
})()""")
for r in json.loads(res): print(json.dumps(r, ensure_ascii=False))
