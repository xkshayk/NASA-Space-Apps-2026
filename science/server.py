"""Read-only loopback API. Vite proxies /api to this service."""
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs,urlparse
from engine import Engine, LOCK

engine=Engine()
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.headers.get('Host','').split(':')[0] not in ['127.0.0.1','localhost']:
            self.send_error(403); return
        parsed=urlparse(self.path)
        if len(self.path)>5000: self.send_error(414); return
        params={k:v[-1] for k,v in parse_qs(parsed.query).items()}
        try:
            with LOCK:
                routes={'/api/catalog':lambda:engine.metadata(),'/api/state':lambda:engine.state(params),'/api/timeline':lambda:engine.timeline(params),'/api/candidates':lambda:engine.candidates(params),'/api/point':lambda:engine.point(params),'/api/horizon':lambda:engine.horizon_check(params),'/api/health':lambda:{'ready':True,'engine':'NASA SPICE','modelVersion':'3.0'}}
                if parsed.path not in routes: self.send_error(404); return
                result=routes[parsed.path]()
            payload=json.dumps(result,allow_nan=False,separators=(',',':')).encode()
            self.send_response(200)
        except (ValueError,KeyError) as error:
            payload=json.dumps({'error':str(error)}).encode(); self.send_response(400)
        except Exception as error:
            print(type(error).__name__,str(error),file=sys.stderr,flush=True)
            payload=json.dumps({'error':'Scientific calculation failed; check local service logs. No fallback data was substituted.'}).encode(); self.send_response(500)
        try:
            self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(payload))); self.send_header('Cache-Control','no-store'); self.send_header('X-Content-Type-Options','nosniff'); self.end_headers(); self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass  # A new slider position can cancel an obsolete browser request.
    def log_message(self, *args): pass

if __name__=='__main__':
    print('Science API ready at http://127.0.0.1:8000',flush=True)
    ThreadingHTTPServer(('127.0.0.1',8000),Handler).serve_forever()
