import * as THREE from 'three';

/** One continuous skull: rounded temples, narrower jaw, no intersecting chin. */
export function createHeadGeometry(): THREE.SphereGeometry {
  const geometry = new THREE.SphereGeometry(0.228, 24, 18);
  const positions = geometry.getAttribute('position');
  for (let index = 0; index < positions.count; index += 1) {
    const y = positions.getY(index);
    const jaw = THREE.MathUtils.smoothstep(-y, 0.02, 0.228);
    positions.setXYZ(index, positions.getX(index) * (0.94 - jaw * 0.16), y * 1.02, positions.getZ(index) * 0.96);
  }
  geometry.computeVertexNormals();
  return geometry;
}

/** A tapered tailored silhouette instead of a box with a shoulder ball. */
export function createTorsoGeometry(): THREE.LatheGeometry {
  return new THREE.LatheGeometry([
    new THREE.Vector2(0, 0.91),
    new THREE.Vector2(0.18, 0.91),
    new THREE.Vector2(0.22, 0.94),
    new THREE.Vector2(0.225, 1.04),
    new THREE.Vector2(0.25, 1.22),
    new THREE.Vector2(0.278, 1.34),
    new THREE.Vector2(0.245, 1.43),
    new THREE.Vector2(0.16, 1.48),
    new THREE.Vector2(0.102, 1.49),
  ], 24);
}

export function createSmileGeometry(width: number, curve: number, smirk: boolean): THREE.TubeGeometry {
  return new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-0.047 * width, 0.005, 0),
    new THREE.Vector3(0, -curve * 0.14, 0.009),
    new THREE.Vector3(0.047 * width, smirk ? 0.02 : 0.005, 0),
  ), 14, 0.006, 5, false);
}
