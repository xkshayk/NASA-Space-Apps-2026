"""Verified HTTP byte ranges for Rasterio's seekable Python opener.

Some GDAL/libcurl builds intermittently return empty COG tiles. This bounded
standard-library reader checks every range and retries without disabling TLS.
"""
from collections import OrderedDict
import io
import time
import urllib.request

class RangeReader(io.RawIOBase):
    def __init__(self, url):
        super().__init__()
        self.url, self.position, self.cache = url, 0, OrderedDict()
        with urllib.request.urlopen(urllib.request.Request(url, method="HEAD"), timeout=60) as r:
            self.size = int(r.headers["Content-Length"])
            self.etag = r.headers.get("ETag")
        self.block_size = 1024 * 1024

    def readable(self): return True
    def seekable(self): return True
    def tell(self): return self.position
    def seek(self, offset, whence=0):
        self.position = offset if whence == 0 else self.position + offset if whence == 1 else self.size + offset
        if self.position < 0: raise ValueError("Negative seek")
        return self.position

    def read(self, size=-1):
        if size < 0: size = self.size - self.position
        if size > 64*1024*1024: raise ValueError("Refusing an unbounded remote read")
        end = min(self.position + size, self.size)
        chunks = []
        while self.position < end:
            block = self.position // self.block_size
            if block not in self.cache:
                lo, hi = block*self.block_size, min((block+1)*self.block_size,self.size)-1
                for attempt in range(3):
                    try:
                        req = urllib.request.Request(self.url, headers={"Range":f"bytes={lo}-{hi}", "User-Agent":"LunarHorizon/0.3"})
                        with urllib.request.urlopen(req, timeout=90) as response:
                            if response.status != 206 or not response.headers.get("Content-Range", "").startswith(f"bytes {lo}-{hi}/"):
                                raise IOError("Server did not honor requested byte range")
                            if self.etag and response.headers.get("ETag") != self.etag:
                                raise IOError("Upstream source changed during import")
                            value = response.read(hi-lo+2)
                            if len(value) != hi-lo+1: raise IOError("Truncated byte range")
                        self.cache[block] = value
                        break
                    except Exception:
                        if attempt == 2: raise
                        time.sleep(1)
            self.cache.move_to_end(block)
            while len(self.cache) > 24: self.cache.popitem(last=False)
            offset = self.position % self.block_size
            take = min(end-self.position, len(self.cache[block])-offset)
            chunks.append(self.cache[block][offset:offset+take])
            self.position += take
        return b"".join(chunks)

    def readinto(self, buffer):
        data = self.read(len(buffer))
        buffer[:len(data)] = data
        return len(data)

def remote_opener(url):
    name = url.rsplit("/", 1)[-1]
    def open_file(path, mode="rb"):
        if str(path) != name: raise FileNotFoundError(str(path))
        return RangeReader(url)
    return name, open_file
