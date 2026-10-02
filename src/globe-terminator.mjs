import {MathUtils, Vector3} from 'three';

const PATCH_KEY = 'brew-atlas-soft-terminator-v1';
const vertexDeclarations = '\nvarying vec3 vBrewTerminatorWorldNormal;\n';
const fragmentDeclarations = `
varying vec3 vBrewTerminatorWorldNormal;
uniform vec3 uBrewTerminatorSunDirection;
uniform float uBrewTerminatorTwilight;
uniform float uBrewTerminatorNightBrightness;
`;
const fragmentShading = `
// Geometric sphere normal keeps the terminator smooth over terrain textures.
float brewSunFacing = dot(normalize(vBrewTerminatorWorldNormal), uBrewTerminatorSunDirection);
float brewDaylight = smoothstep(-uBrewTerminatorTwilight, uBrewTerminatorTwilight, brewSunFacing);
vec3 brewNightGain = uBrewTerminatorNightBrightness * vec3(0.82, 0.92, 1.0);
outgoingLight *= mix(brewNightGain, vec3(1.0), brewDaylight);
`;

/**
 * Shade only the existing globe's MeshPhongMaterial. No overlay geometry,
 * raycasting objects, textures, timers, or animation loops are created.
 * Bottles and plant materials are untouched and remain visible at night.
 *
 * Usage:
 *   const terminator = createGlobeTerminator({material: globeMaterial});
 *   terminator.updateFromCamera(globe.camera()); // after initial pointOfView
 *   // Repeat on controls/onZoom and resize, never a separate frame loop.
 *   // Optional: sunlight.position.copy(terminator.sunDirection).multiplyScalar(400)
 *   terminator.dispose(); // restores hooks, does NOT dispose shared material
 *
 * screenSunDirection is a camera-space direction: +x right, +y up,
 * +z towards the viewer. The default depicts a distant sun at upper left.
 * This is a visual day/night illustration, not current astronomical sunlight.
 */
export function createGlobeTerminator({
  material,
  screenSunDirection = [-1, 0.8, 0.45],
  twilightDegrees = 9,
  nightBrightness = 0.32,
} = {}) {
  if (!material?.isMeshPhongMaterial) {
    throw new TypeError('Globe terminator requires the globe MeshPhongMaterial.');
  }
  if (!Array.isArray(screenSunDirection) || screenSunDirection.length !== 3 ||
      !screenSunDirection.every(Number.isFinite) ||
      screenSunDirection.every(component => component === 0)) {
    throw new TypeError('screenSunDirection must be a finite, nonzero three-component vector.');
  }
  if (!Number.isFinite(twilightDegrees) || !Number.isFinite(nightBrightness)) {
    throw new TypeError('Terminator twilight and brightness must be finite.');
  }

  const viewSun = new Vector3().fromArray(screenSunDirection).normalize();
  const sunDirection = viewSun.clone();
  const candidateDirection = new Vector3();
  const uniforms = {
    uBrewTerminatorSunDirection: {value: sunDirection},
    uBrewTerminatorTwilight: {
      value: Math.sin(MathUtils.degToRad(MathUtils.clamp(twilightDegrees, 0.5, 40))),
    },
    uBrewTerminatorNightBrightness: {value: MathUtils.clamp(nightBrightness, 0.05, 1)},
  };
  const previousCompile = material.onBeforeCompile;
  const previousCacheKey = material.customProgramCacheKey;
  // Evaluate before patching: Three's default cache key reads onBeforeCompile.
  const baseCacheKey = previousCacheKey.call(material);
  let disposed = false;

  function onBeforeCompile(shader, renderer) {
    previousCompile.call(material, shader, renderer);
    if (!shader.vertexShader.includes('#include <normal_vertex>') ||
        !shader.fragmentShader.includes('#include <opaque_fragment>')) {
      throw new Error('Globe terminator cannot find the expected MeshPhong shader chunks.');
    }
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>${vertexDeclarations}`)
      .replace('#include <normal_vertex>', `#include <normal_vertex>
vBrewTerminatorWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>${fragmentDeclarations}`)
      .replace('#include <opaque_fragment>', `${fragmentShading}\n#include <opaque_fragment>`);
  }
  function customProgramCacheKey() {
    return `${baseCacheKey}|${PATCH_KEY}`;
  }
  material.onBeforeCompile = onBeforeCompile;
  material.customProgramCacheKey = customProgramCacheKey;
  material.needsUpdate = true;

  return {
    // Read this stable vector to align the globe's existing directional light.
    // Call updateFromCamera instead of mutating it directly.
    sunDirection,
    updateFromCamera(camera) {
      if (disposed || !camera?.isCamera) return false;
      camera.updateWorldMatrix(true, false);
      candidateDirection.copy(viewSun).transformDirection(camera.matrixWorld);
      if (candidateDirection.distanceToSquared(sunDirection) < 1e-12) return false;
      sunDirection.copy(candidateDirection);
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (material.onBeforeCompile === onBeforeCompile) material.onBeforeCompile = previousCompile;
      if (material.customProgramCacheKey === customProgramCacheKey) material.customProgramCacheKey = previousCacheKey;
      material.needsUpdate = true;
    },
  };
}
