"""Convert official source products into documented browser assets."""
from pathlib import Path
import json
import shutil
import numpy as np
import rasterio
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
out = ROOT/'web/public/assets'
out.mkdir(parents=True, exist_ok=True)
with rasterio.open(ROOT/'data/raw/moon-color.tif') as src:
    rgb = np.moveaxis(src.read()[:3], 0, -1)
    if rgb.dtype == np.uint16: rgb = (rgb/257).round().astype('uint8')
    Image.fromarray(rgb).save(out/'moon.jpg', quality=94)
shutil.copy2(ROOT/'data/raw/earth.png', out/'earth.png')
with rasterio.open(ROOT/'data/raw/moon-dem.tif') as src:
    heights = src.read(1)
    # Preserve actual relief; no vertical exaggeration. Mesh resolution 0.5 degrees.
    reduced = heights[::8, ::8].astype('<f4')
    reduced.tofile(out/'moon-height.f32')
    # Lighting detail only; the scientific engine reads the full float DEM.
    normalized = np.clip((heights + 10)/20, 0, 1)
    Image.fromarray((normalized*65535).astype('uint16')).save(out/'moon-height.png')
    (out/'terrain.json').write_text(json.dumps({'width': reduced.shape[1], 'height': reduced.shape[0], 'units': 'km', 'referenceRadiusKm': 1737.4, 'sourceResolutionDegrees': 1/16, 'meshResolutionDegrees': 0.5, 'source': 'https://svs.gsfc.nasa.gov/4720/', 'exaggeration': 1}, indent=2))
print('Prepared NASA textures and unexaggerated LOLA relief in web/public/assets')
