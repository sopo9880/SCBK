import sys, time, json, os, threading, http.server, socketserver, functools, os
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath('app')
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/claude-0/shots'
os.makedirs(OUT, exist_ok=True)
Handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
Handler.log_message = lambda *a: None
srv = socketserver.TCPServer(('127.0.0.1', 0), Handler); port = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
script = sys.argv[2] if len(sys.argv) > 2 else ''
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 1280, 'height': 760})
    logs = []
    pg.on('console', lambda m: logs.append(f'[{m.type}] {m.text}'))
    pg.on('pageerror', lambda e: logs.append(f'[pageerror] {e}'))
    pg.add_init_script("localStorage.setItem('we.settings', JSON.stringify({radius:500, quality:'medium', time:'noon', physWorker: !!sessionStorage.getItem('W')}))")
    pg.goto(f'http://127.0.0.1:{port}/index.html')
    pg.wait_for_timeout(800)
    pg.screenshot(path=f'{OUT}/menu.png')
    exec(script)
    for l in logs[-40:]: print(l)
    b.close()
