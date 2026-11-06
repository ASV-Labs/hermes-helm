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
