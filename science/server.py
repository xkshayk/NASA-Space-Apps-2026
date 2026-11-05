"""Read-only loopback API. Vite proxies /api to this service.

Requests run on separate threads. Only SPICE calls are serialized (engine.LOCK),
so a quick /api/state request is not queued behind a 30-day timeline. When the
browser abandons a long request (a newer slider position, site or window), the
calculation stops at its next checkpoint instead of finishing unseen.
"""
import json
import select
import socket
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse
from engine import Engine, Cancelled

engine = Engine()

class Handler(BaseHTTPRequestHandler):
    def client_gone(self):
        """True once the requesting socket has closed (peek without consuming)."""
        try:
            readable, _, _ = select.select([self.connection], [], [], 0)
            return bool(readable) and self.connection.recv(1, socket.MSG_PEEK) == b''
        except (OSError, ValueError):
            return True

    def reply(self, status, result):
        payload = json.dumps(result, allow_nan=False, separators=(',', ':')).encode()
        try:
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(payload)))
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.end_headers()
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass  # A new slider position can cancel an obsolete browser request.

    def do_GET(self):
        if self.headers.get('Host', '').split(':')[0] not in ['127.0.0.1', 'localhost']:
            return self.reply(403, {'error': 'Local requests only'})
        if len(self.path) > 5000:
            return self.reply(414, {'error': 'Request URL too long'})
        parsed = urlparse(self.path)
        params = {k: v[-1] for k, v in parse_qs(parsed.query).items()}
        cancelled = self.client_gone
        routes = {
            '/api/health': lambda: {'ready': True, 'engine': 'NASA SPICE', 'modelVersion': '3.1'},
            '/api/catalog': engine.metadata,
            '/api/state': lambda: engine.state(params),
            '/api/point': lambda: engine.point(params),
            '/api/timeline': lambda: engine.timeline(params, cancelled),
            '/api/candidates': lambda: engine.candidates(params, cancelled),
            '/api/horizon': lambda: engine.horizon_check(params),
        }
        if parsed.path not in routes:
            return self.reply(404, {'error': f'Unknown endpoint {parsed.path}'})
        try:
            self.reply(200, routes[parsed.path]())
        except Cancelled:
            pass  # Nobody is waiting for this answer.
        except KeyError as error:
            self.reply(400, {'error': f'Missing parameter: {error.args[0]}'})
        except ValueError as error:
            self.reply(400, {'error': str(error)})
        except Exception as error:
            print(type(error).__name__, str(error), file=sys.stderr, flush=True)
            self.reply(500, {'error': 'Scientific calculation failed; check local service logs. No fallback data was substituted.'})

    def log_message(self, *args):
        pass

if __name__ == '__main__':
    print('Science API ready at http://127.0.0.1:8000', flush=True)
    ThreadingHTTPServer(('127.0.0.1', 8000), Handler).serve_forever()
