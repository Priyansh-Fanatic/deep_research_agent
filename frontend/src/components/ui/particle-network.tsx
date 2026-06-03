import { useEffect, useRef } from 'react';
import * as THREE from 'three';

export function ParticleNetwork() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Create Scene, Camera, and Renderer
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, width / height, 1, 1000);
    camera.position.z = 400;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Particle Configuration
    const particleCount = 75;
    const particlesGeometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    
    const particlesData: Array<{
      velocity: THREE.Vector3;
      numConnections: number;
    }> = [];

    // Initialize positions and velocities
    const bounds = 300;
    for (let i = 0; i < particleCount; i++) {
      const x = Math.random() * bounds - bounds / 2;
      const y = Math.random() * bounds - bounds / 2;
      const z = Math.random() * bounds - bounds / 2;

      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;

      // Soft pastel colors (sky blue, teal, indigo)
      const mix = Math.random();
      if (mix < 0.33) {
        colors[i * 3] = 0.58;     // R
        colors[i * 3 + 1] = 0.84; // G
        colors[i * 3 + 2] = 0.94; // B (Soft Sky Blue)
      } else if (mix < 0.66) {
        colors[i * 3] = 0.38;
        colors[i * 3 + 1] = 0.75;
        colors[i * 3 + 2] = 0.85; // Soft Teal
      } else {
        colors[i * 3] = 0.49;
        colors[i * 3 + 1] = 0.42;
        colors[i * 3 + 2] = 0.89; // Soft Indigo
      }

      particlesData.push({
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 0.4,
          (Math.random() - 0.5) * 0.4,
          (Math.random() - 0.5) * 0.4
        ),
        numConnections: 0,
      });
    }

    particlesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    particlesGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Particle Material
    const particlesMaterial = new THREE.PointsMaterial({
      size: 4.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.65,
      sizeAttenuation: true,
    });

    const particleSystem = new THREE.Points(particlesGeometry, particlesMaterial);
    scene.add(particleSystem);

    // Line Network Configuration
    const maxConnections = 8;
    const minDistance = 75;

    const linePositions = new Float32Array(particleCount * maxConnections * 3 * 2);
    const lineColors = new Float32Array(particleCount * maxConnections * 3 * 2);

    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3).setUsage(THREE.DynamicDrawUsage));
    lineGeometry.setAttribute('color', new THREE.BufferAttribute(lineColors, 3).setUsage(THREE.DynamicDrawUsage));

    const lineMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.22,
      linewidth: 1,
    });

    const linesMesh = new THREE.LineSegments(lineGeometry, lineMaterial);
    scene.add(linesMesh);

    // Mouse Interaction
    const mouse = new THREE.Vector2(9999, 9999);
    const targetMouse = new THREE.Vector2(9999, 9999);

    const onMouseMove = (event: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      // Normalized coordinates
      targetMouse.x = ((event.clientX - rect.left) / width) * 2 - 1;
      targetMouse.y = -((event.clientY - rect.top) / height) * 2 + 1;
    };

    window.addEventListener('mousemove', onMouseMove);

    // Animation Loop
    let animationId: number;

    const animate = () => {
      animationId = requestAnimationFrame(animate);

      // Smooth mouse tracking
      mouse.x += (targetMouse.x - mouse.x) * 0.1;
      mouse.y += (targetMouse.y - mouse.y) * 0.1;

      // Project mouse into 3D space
      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);
      const mousePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
      const mouse3D = new THREE.Vector3();
      raycaster.ray.intersectPlane(mousePlane, mouse3D);

      const positionsAttr = particlesGeometry.getAttribute('position') as THREE.BufferAttribute;
      const positionsArray = positionsAttr.array as Float32Array;

      // Update positions
      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        let x = positionsArray[i3];
        let y = positionsArray[i3 + 1];
        let z = positionsArray[i3 + 2];

        // Move particle
        const data = particlesData[i];
        x += data.velocity.x;
        y += data.velocity.y;
        z += data.velocity.z;

        // Bounce off bounds
        if (x < -bounds / 2 || x > bounds / 2) data.velocity.x *= -1;
        if (y < -bounds / 2 || y > bounds / 2) data.velocity.y *= -1;
        if (z < -bounds / 2 || z > bounds / 2) data.velocity.z *= -1;

        // Mouse influence: Push particles away subtly
        if (mouse.x < 1000) {
          const particleVec = new THREE.Vector3(x, y, z);
          const distToMouse = particleVec.distanceTo(mouse3D);
          if (distToMouse < 90) {
            const force = (90 - distToMouse) * 0.08;
            const dir = new THREE.Vector3().subVectors(particleVec, mouse3D).normalize();
            x += dir.x * force;
            y += dir.y * force;
          }
        }

        positionsArray[i3] = x;
        positionsArray[i3 + 1] = y;
        positionsArray[i3 + 2] = z;

        data.numConnections = 0;
      }

      positionsAttr.needsUpdate = true;

      // Update Lines
      const linePosAttr = lineGeometry.getAttribute('position') as THREE.BufferAttribute;
      const linePosArray = linePosAttr.array as Float32Array;
      const lineColAttr = lineGeometry.getAttribute('color') as THREE.BufferAttribute;

      let vertexIdx = 0;
      let colorIdx = 0;

      for (let i = 0; i < particleCount; i++) {
        const i3 = i * 3;
        const x1 = positionsArray[i3];
        const y1 = positionsArray[i3 + 1];
        const z1 = positionsArray[i3 + 2];

        for (let j = i + 1; j < particleCount; j++) {
          const j3 = j * 3;
          const x2 = positionsArray[j3];
          const y2 = positionsArray[j3 + 1];
          const z2 = positionsArray[j3 + 2];

          const dx = x1 - x2;
          const dy = y1 - y2;
          const dz = z1 - z2;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

          if (dist < minDistance) {
            // Draw connection
            linePosArray[vertexIdx++] = x1;
            linePosArray[vertexIdx++] = y1;
            linePosArray[vertexIdx++] = z1;
            linePosArray[vertexIdx++] = x2;
            linePosArray[vertexIdx++] = y2;
            linePosArray[vertexIdx++] = z2;

            // Fade lines based on distance
            const alpha = 1.0 - dist / minDistance;
            
            // Match soft blue/indigo theme
            lineColors[colorIdx++] = 0.58;
            lineColors[colorIdx++] = 0.74 * alpha;
            lineColors[colorIdx++] = 0.94 * alpha;
            
            lineColors[colorIdx++] = 0.49;
            lineColors[colorIdx++] = 0.42 * alpha;
            lineColors[colorIdx++] = 0.89 * alpha;
          }
        }
      }

      linePosAttr.needsUpdate = true;
      lineColAttr.needsUpdate = true;

      renderer.render(scene, camera);
    };

    animate();

    // Resize Handler
    const handleResize = () => {
      if (!containerRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    // Clean up
    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', handleResize);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      particlesGeometry.dispose();
      particlesMaterial.dispose();
      lineGeometry.dispose();
      lineMaterial.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        opacity: 0.85,
        zIndex: 1,
      }}
    />
  );
}
