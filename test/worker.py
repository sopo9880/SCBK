import json
pg.evaluate("sessionStorage.setItem('W','1')")
pg.reload(); pg.wait_for_timeout(800)
pg.evaluate("(()=>{const r=document.querySelector('#radius'); r.value=900; r.oninput();})()")
pg.evaluate("window.__start({demo:true, name:'데모 시티', sub:'오프라인'})")
pg.wait_for_function("window.__game && document.querySelector('#loading').hidden", timeout=300000)
print('mode', pg.evaluate("window.__game.phys.mode"), pg.evaluate("document.querySelector('#steps').innerText.split('\\n')[0]"))
pg.evaluate("""(()=>{const g=window.__game; g.controls.enableDamping=false; g.controls.target.set(0,g.grid.sample(0,0),0); g.camera.position.set(420,330,520); g.controls.update(); g._mouse.set(0,0); g.camera.updateMatrixWorld();
 const A=g.arsenal; A.current='bomb'; A.power=10; const b=[...g.data.buildings].sort((a,c)=>c.height-a.height)[0]; A.blast({x:b.cx,y:b.baseY+b.height*0.5,z:b.cz}, 50, 40, {vap:5}); window.__b=b;})()""")
for i in range(6):
    pg.wait_for_timeout(1000)
    print(pg.evaluate("""(()=>{const g=window.__game, D=g.D; const d=[...D.dynamic].slice(0,3).map(c=>[+c.x.toFixed(1),+c.y.toFixed(1),+c.z.toFixed(1)]); return JSON.stringify({fps:Math.round(g.fps), dyn:D.dynamic.size, loose:D.loose.size, stepMs:+D.phys.stepMs.toFixed(1), sample:d});})()"""))
pg.evaluate("(()=>{const g=window.__game; const A=g.arsenal; A.power=10; A.opts.realNuke=true; A.nukeHit({x:0,y:0,z:0});})()")
for i in range(6):
    pg.wait_for_timeout(1500)
    print('nuke', pg.evaluate("""(()=>{const g=window.__game, D=g.D; return JSON.stringify({fps:Math.round(g.fps), dyn:D.dynamic.size, loose:D.loose.size, stepMs:+D.phys.stepMs.toFixed(1), pend:D._pendingQ.length});})()"""))
print("err", pg.evaluate("window.__game.phys.lastErr||null"), pg.evaluate("window.__game.phys._inflight"))
for l in logs[-10:]: print(l)
