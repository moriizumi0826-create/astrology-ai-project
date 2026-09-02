import * as THREE from "three";

import sunTextureUrl from "./assets/planet-textures/sun.webp";
import moonTextureUrl from "./assets/planet-textures/moon.webp";
import mercuryTextureUrl from "./assets/planet-textures/mercury.webp";
import venusTextureUrl from "./assets/planet-textures/venus.webp";
import earthTextureUrl from "./assets/planet-textures/earth.webp";
import earthCloudTextureUrl from "./assets/planet-textures/earth-clouds.webp";
import marsTextureUrl from "./assets/planet-textures/mars.webp";
import jupiterTextureUrl from "./assets/planet-textures/jupiter.webp";
import saturnTextureUrl from "./assets/planet-textures/saturn.webp";
import saturnRingTextureUrl from "./assets/planet-textures/saturn-rings.webp";
import uranusTextureUrl from "./assets/planet-textures/uranus.webp";
import neptuneTextureUrl from "./assets/planet-textures/neptune.webp";
import plutoTextureUrl from "./assets/planet-textures/pluto.webp";

const PLANET_TEXTURE_URLS = Object.freeze({
  SUN: sunTextureUrl,
  MOON: moonTextureUrl,
  MERCURY: mercuryTextureUrl,
  VENUS: venusTextureUrl,
  EARTH: earthTextureUrl,
  MARS: marsTextureUrl,
  JUPITER: jupiterTextureUrl,
  SATURN: saturnTextureUrl,
  URANUS: uranusTextureUrl,
  NEPTUNE: neptuneTextureUrl,
  PLUTO: plutoTextureUrl,
});

const textureLoader = new THREE.TextureLoader();
const sceneTextureCaches = new WeakMap();

function loadTexture(url, textures, { color = true, repeat = false } = {}) {
  let cache = sceneTextureCaches.get(textures);
  if (!cache) {
    cache = new Map();
    sceneTextureCaches.set(textures, cache);
  }
  if (cache.has(url)) return cache.get(url);

  const texture = textureLoader.load(url);
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.wrapS = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  textures.push(texture);
  cache.set(url, texture);
  return texture;
}

export function loadPlanetSurfaceTexture(planet, textures) {
  const url = PLANET_TEXTURE_URLS[planet] || PLANET_TEXTURE_URLS.MOON;
  return loadTexture(url, textures, { repeat: true });
}

export function loadEarthSurfaceTexture(textures) {
  return loadTexture(earthTextureUrl, textures, { repeat: true });
}

export function loadEarthCloudTexture(textures) {
  return loadTexture(earthCloudTextureUrl, textures, { repeat: true });
}

export function loadSaturnRingTexture(textures) {
  return loadTexture(saturnRingTextureUrl, textures);
}
