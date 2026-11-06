import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'dashboard'))
from fastapi import FastAPI
from fastapi.testclient import TestClient
import plugin_api

app = FastAPI(); app.include_router(plugin_api.router, prefix='/api/plugins/helm')
c = TestClient(app)
m = c.get('/api/plugins/helm/sprites/manifest').json()
assert m['colors'] and m['faces'], m
assert any(n.startswith('base_') for n in m['available']), 'no base sprites rendered yet'
one = c.get('/api/plugins/helm/sprites/base_blue.png').json()
assert one['url'].startswith('data:image/png;base64,')
b = c.get('/api/plugins/helm/sprites/batch', params={'names': 'base_blue.png,face_idle_blue.png,nope.png,../x.png'}).json()['sprites']
assert b['base_blue.png'] and b['nope.png'] is None and b['../x.png'] is None
assert c.get('/api/plugins/helm/sprites/..%2Fmanifest.json').status_code in (404, 422)
print('plugin_api ok:', len(m['available']), 'sprites available')

# Desk: without a Hermes install the cron import fails and the list is hidden, not an error.
t = c.get('/api/plugins/helm/desk/today')
assert t.status_code == 200 and t.json()['available'] in (True, False), t.text
plugin_api._list_jobs = lambda: [{'id': 'j1', 'name': 'Weekly', 'profile': 'builder', 'last_run_at': '2026-11-06T16:28:00', 'latest_execution': {'status': 'failed'}, 'last_error': 'x' * 400}, 'junk']
j = c.get('/api/plugins/helm/desk/today').json()
assert j['available'] and j['jobs'][0]['last_status'] == 'error' and len(j['jobs'][0]['last_error']) == 300 and len(j['jobs']) == 1, j
print('desk/today ok')
