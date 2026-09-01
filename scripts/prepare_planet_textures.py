"""Build browser-friendly planet textures from NASA/JPL source imagery.

The generated WebP files are committed under frontend/src/assets/planet-textures.
Run this script only when the source images need to be refreshed.
"""

from __future__ import annotations

import io
import json
import math
import os
import struct
import tempfile
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "frontend" / "src" / "assets" / "planet-textures"

SOURCE_URLS = {
    "sun": "https://sdo.gsfc.nasa.gov/assets/img/latest/latest_2048_0304.jpg",
    "moon": "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_2k.jpg",
    "mercury_model": "https://assets.science.nasa.gov/content/dam/science/psd/solar/2023/09/m/Mercury_1_4878.glb",
    "venus_model": "https://assets.science.nasa.gov/content/dam/science/psd/solar/2023/09/v/Venus_1_12103.glb",
    "earth": "https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57730/land_ocean_ice_2048.png",
    "earth_clouds": "https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_2048.jpg",
    "mars": "https://assets.science.nasa.gov/content/dam/science/cds/3d/resources/image/mars/Mars.jpg",
    "jupiter_model": "https://assets.science.nasa.gov/content/dam/science/psd/solar/2023/09/j/Jupiter_1_142984.glb",
    "saturn_model": "https://assets.science.nasa.gov/content/dam/science/psd/solar/2023/09/s/Saturn_1_120536.glb",
    "uranus_model": "https://assets.science.nasa.gov/content/dam/science/psd/solar/2023/09/u/Uranus_1_51118.glb",
    "neptune_model": "https://assets.science.nasa.gov/content/dam/science/psd/solar/2023/09/n/Neptune_1_49528.glb",
    "pluto_model": "https://assets.science.nasa.gov/content/dam/science/psd/solar/2023/09/p/l/Pluto_1_2374.glb",
}


def download(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "The-Celestial-Atelier-texture-builder/1.0"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return response.read()


def glb_images(payload: bytes) -> list[Image.Image]:
    stream = io.BytesIO(payload)
    magic, version, total_length = struct.unpack("<4sII", stream.read(12))
    if magic != b"glTF" or version != 2 or total_length != len(payload):
        raise ValueError("Unsupported GLB payload")
    json_length, json_type = struct.unpack("<I4s", stream.read(8))
    if json_type != b"JSON":
        raise ValueError("GLB JSON chunk is missing")
    document = json.loads(stream.read(json_length))
    binary_length, binary_type = struct.unpack("<I4s", stream.read(8))
    if binary_type != b"BIN\x00":
        raise ValueError("GLB binary chunk is missing")
    binary = stream.read(binary_length)

    result: list[Image.Image] = []
    for item in document.get("images", []):
        view = document["bufferViews"][item["bufferView"]]
        start = view.get("byteOffset", 0)
        end = start + view["byteLength"]
        result.append(Image.open(io.BytesIO(binary[start:end])).convert("RGBA"))
    return result


def bilinear_sample(source: np.ndarray, x: np.ndarray, y: np.ndarray) -> np.ndarray:
    height, width = source.shape[:2]
    x = np.clip(x, 0, width - 1)
    y = np.clip(y, 0, height - 1)
    x0 = np.floor(x).astype(np.int32)
    y0 = np.floor(y).astype(np.int32)
    x1 = np.minimum(x0 + 1, width - 1)
    y1 = np.minimum(y0 + 1, height - 1)
    wx = (x - x0)[..., None]
    wy = (y - y0)[..., None]
    top = source[y0, x0] * (1 - wx) + source[y0, x1] * wx
    bottom = source[y1, x0] * (1 - wx) + source[y1, x1] * wx
    return top * (1 - wy) + bottom * wy


def cube_cross_to_equirectangular(source_image: Image.Image, width: int = 2048) -> Image.Image:
    """Convert the cubemap cross used by NASA's VTAD planet models."""

    source = np.asarray(source_image.convert("RGB"), dtype=np.float32)
    face = source.shape[1] // 4
    if source.shape[0] != face * 3:
        raise ValueError(f"Expected a 4x3 cubemap cross, got {source.shape[1]}x{source.shape[0]}")

    height = width // 2
    longitude = ((np.arange(width, dtype=np.float32) + 0.5) / width * 2 - 1) * math.pi
    latitude = (0.5 - (np.arange(height, dtype=np.float32) + 0.5) / height) * math.pi
    longitude, latitude = np.meshgrid(longitude, latitude)
    cos_latitude = np.cos(latitude)
    x = cos_latitude * np.cos(longitude)
    y = np.sin(latitude)
    z = cos_latitude * np.sin(longitude)
    absolute = np.stack((np.abs(x), np.abs(y), np.abs(z)), axis=-1)
    dominant = np.argmax(absolute, axis=-1)

    local_u = np.zeros_like(x)
    local_v = np.zeros_like(y)
    cell_x = np.zeros_like(x)
    cell_y = np.zeros_like(y)

    masks = {
        "positive_x": (dominant == 0) & (x >= 0),
        "negative_x": (dominant == 0) & (x < 0),
        "positive_y": (dominant == 1) & (y >= 0),
        "negative_y": (dominant == 1) & (y < 0),
        "positive_z": (dominant == 2) & (z >= 0),
        "negative_z": (dominant == 2) & (z < 0),
    }

    mask = masks["positive_x"]
    local_u[mask], local_v[mask], cell_x[mask], cell_y[mask] = z[mask] / x[mask], -y[mask] / x[mask], 3, 1
    mask = masks["negative_x"]
    local_u[mask], local_v[mask], cell_x[mask], cell_y[mask] = -z[mask] / -x[mask], -y[mask] / -x[mask], 1, 1
    mask = masks["positive_z"]
    local_u[mask], local_v[mask], cell_x[mask], cell_y[mask] = -x[mask] / z[mask], -y[mask] / z[mask], 0, 1
    mask = masks["negative_z"]
    local_u[mask], local_v[mask], cell_x[mask], cell_y[mask] = x[mask] / -z[mask], -y[mask] / -z[mask], 2, 1
    mask = masks["positive_y"]
    local_u[mask], local_v[mask], cell_x[mask], cell_y[mask] = -z[mask] / y[mask], -x[mask] / y[mask], 2, 0
    mask = masks["negative_y"]
    local_u[mask], local_v[mask], cell_x[mask], cell_y[mask] = z[mask] / -y[mask], -x[mask] / -y[mask], 0, 2

    sample_x = cell_x * face + (local_u + 1) * 0.5 * (face - 1)
    sample_y = cell_y * face + (local_v + 1) * 0.5 * (face - 1)
    converted = bilinear_sample(source, sample_x, sample_y)
    return Image.fromarray(np.clip(converted, 0, 255).astype(np.uint8), "RGB")


def sun_disk_to_equirectangular(source_image: Image.Image, width: int = 2048) -> Image.Image:
    source = np.asarray(source_image.convert("RGB"), dtype=np.float32)
    height = width // 2
    longitude = ((np.arange(width, dtype=np.float32) + 0.5) / width * 2 - 1) * math.pi
    longitude = np.where(longitude > math.pi / 2, math.pi - longitude, longitude)
    longitude = np.where(longitude < -math.pi / 2, -math.pi - longitude, longitude)
    latitude = (0.5 - (np.arange(height, dtype=np.float32) + 0.5) / height) * math.pi
    longitude, latitude = np.meshgrid(longitude, latitude)
    # The downloadable SDO frame includes a broad black border and a timestamp.
    # Stay just inside the observed solar limb so no border pixels reach the sphere.
    radius = min(source.shape[0], source.shape[1]) * 0.36
    center_x = (source.shape[1] - 1) * 0.5
    center_y = (source.shape[0] - 1) * 0.48
    sample_x = center_x + radius * np.cos(latitude) * np.sin(longitude)
    sample_y = center_y - radius * np.sin(latitude)
    converted = bilinear_sample(source, sample_x, sample_y)
    return Image.fromarray(np.clip(converted, 0, 255).astype(np.uint8), "RGB")


def cloud_alpha_texture(source_image: Image.Image) -> Image.Image:
    grayscale = np.asarray(source_image.convert("L"), dtype=np.float32)
    alpha = np.clip((grayscale - 10) * 1.18, 0, 255).astype(np.uint8)
    color = np.full((*alpha.shape, 3), 255, dtype=np.uint8)
    return Image.fromarray(np.dstack((color, alpha)), "RGBA")


def saturn_ring_texture(strip_image: Image.Image, size: int = 1024) -> Image.Image:
    strip = np.asarray(strip_image.convert("RGBA"), dtype=np.float32)
    axis = np.linspace(-1, 1, size, dtype=np.float32)
    xx, yy = np.meshgrid(axis, axis)
    radius = np.sqrt(xx * xx + yy * yy)
    inner_radius = 0.48
    outer_radius = 0.985
    strip_position = np.clip((radius - inner_radius) / (outer_radius - inner_radius), 0, 1)
    sample_x = strip_position * (strip.shape[1] - 1)
    sample_y = np.full_like(sample_x, (strip.shape[0] - 1) * 0.5)
    converted = bilinear_sample(strip, sample_x, sample_y)
    converted[..., 3] *= ((radius >= inner_radius) & (radius <= outer_radius)).astype(np.float32)
    return Image.fromarray(np.clip(converted, 0, 255).astype(np.uint8), "RGBA")


def fit_equirectangular(image: Image.Image, width: int) -> Image.Image:
    height = width // 2
    if image.size == (width, height):
        return image
    return image.resize((width, height), Image.Resampling.LANCZOS)


def save_webp(image: Image.Image, name: str, quality: int = 90) -> None:
    target = OUTPUT_DIR / f"{name}.webp"
    image.save(target, "WEBP", quality=quality, method=6)
    print(f"{target.relative_to(ROOT)}: {image.width}x{image.height}, {target.stat().st_size:,} bytes")


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="celestial-planet-textures-") as temp_dir:
        cache = Path(temp_dir)
        payloads: dict[str, bytes] = {}
        for name, url in SOURCE_URLS.items():
            print(f"Downloading {name}...")
            payloads[name] = download(url)
            (cache / name).write_bytes(payloads[name])

        save_webp(sun_disk_to_equirectangular(Image.open(io.BytesIO(payloads["sun"]))), "sun", 92)
        save_webp(fit_equirectangular(Image.open(io.BytesIO(payloads["moon"])).convert("RGB"), 2048), "moon", 90)

        mercury = glb_images(payloads["mercury_model"])[0]
        save_webp(cube_cross_to_equirectangular(mercury, 2048), "mercury", 91)
        save_webp(fit_equirectangular(glb_images(payloads["venus_model"])[0].convert("RGB"), 2048), "venus", 91)

        save_webp(fit_equirectangular(Image.open(io.BytesIO(payloads["earth"])).convert("RGB"), 2048), "earth", 92)
        earth_clouds = fit_equirectangular(Image.open(io.BytesIO(payloads["earth_clouds"])), 2048)
        save_webp(cloud_alpha_texture(earth_clouds), "earth-clouds", 90)
        save_webp(fit_equirectangular(Image.open(io.BytesIO(payloads["mars"])).convert("RGB"), 2048), "mars", 91)

        jupiter = glb_images(payloads["jupiter_model"])[0]
        save_webp(cube_cross_to_equirectangular(jupiter, 2048), "jupiter", 92)

        saturn_images = glb_images(payloads["saturn_model"])
        save_webp(cube_cross_to_equirectangular(saturn_images[0], 2048), "saturn", 92)
        save_webp(saturn_ring_texture(saturn_images[1]), "saturn-rings", 94)

        save_webp(fit_equirectangular(glb_images(payloads["uranus_model"])[0].convert("RGB"), 2048), "uranus", 91)
        save_webp(fit_equirectangular(glb_images(payloads["neptune_model"])[0].convert("RGB"), 2048), "neptune", 91)
        save_webp(fit_equirectangular(glb_images(payloads["pluto_model"])[0].convert("RGB"), 2048), "pluto", 92)


if __name__ == "__main__":
    main()
