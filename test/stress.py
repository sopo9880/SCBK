# 조각 수 스트레스: 도시 중심 여러 건물을 세게 날려 조각·파편 수와 프레임 비용 측정
import json, os
pg.evaluate("(()=>{const r=document.querySelector('#radius'); r.value=900; r.oninput();})()")
pg.evaluate("window.__start({demo:true, name:'데모 시티', sub:'오프라인'})")
pg.wait_for_function("window.__game && document.querySelector('#loading').hidden", timeout=300000)
print(pg.evaluate("""(()=>{const g=window.__game, D=g.D; g.renderer.setAnimationLoop(null);
 const out=[]; const bl=[...g.data.buildings].sort((a,b)=>Math.hypot(a.cx,a.cz)-Math.hypot(b.cx,b.cz)).slice(0,90);
 for(const b of bl){ D.fracture(b,0); }
 for(const b of bl) D.explode({x:b.cx,y:b.baseY+b.height*0.4,z:b.cz,r:Math.max(30,b.height*0.8),power:40,lift:0.5,lod:0});
 const T=[]; let frames=0;
 for(let t=0;t<8;t+=1/30){ const t0=performance.now(); g.D.update(1/30); T.push(performance.now()-t0); frames++;
   if(frames%30===0) out.push({t:+t.toFixed(1), loose:D.loose.size, moving:D.dynamic.size, rapierDyn:g.phys.dynCount, light:g.phys.lightCount, stepMs:+g.phys.stepMs.toFixed(1), lightMs:+g.phys.lightMs.toFixed(1), frameMs:+T[T.length-1].toFixed(1)}); }
 let total=0; for(const b of g.data.buildings) if(b.chunks) total+=b.chunks.filter(c=>c.state!==3).length;
 const s=[...T].sort((a,b)=>a-b);
 return JSON.stringify({rows:out, chunksAlive:total, med:+s[s.length>>1].toFixed(1), p95:+s[Math.floor(s.length*0.95)].toFixed(1)});})()"""))
