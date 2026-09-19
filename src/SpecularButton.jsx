import { useRef, useEffect } from 'react';
import { Renderer, Program, Mesh, Triangle, Color } from 'ogl';
import './SpecularButton.css';

const PAD = 20;

const VERT = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAG = `#version 300 es
precision highp float;

uniform vec2 uCenter;
uniform vec2 uHalfSize;
uniform float uRadius;
uniform float uAngle;
uniform float uPx;
uniform vec3 uLineColor;
uniform vec3 uBaseColor;
uniform float uIntensity;
uniform float uShineSize;
uniform float uShineFade;
uniform float uThickness;
uniform float uBaseWidth;

out vec4 fragColor;

float sdRoundedRect(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float shapeSDF(vec2 p) { return sdRoundedRect(p, max(uHalfSize, vec2(1.0, 1.0)), uRadius); }

float gaussianLine(float d, float sigma) {
  float x = d / (sigma + 1e-6);
  float k = mix(1.0, 1.6, smoothstep(0.0, 1.5, x));
  return exp(-k * x * x);
}

void main() {
  vec2 p = gl_FragCoord.xy - uCenter;
  float d = shapeSDF(p);
  vec2 L = vec2(cos(uAngle), sin(uAngle));

  // Dark base stroke hugging the edge for a sense of thickness
  float base = (1.0 - smoothstep(0.0, uBaseWidth, abs(d))) * 0.45;

  // Symmetric specular: the edges facing toward/away from the light both
  // catch a streak. The angular window (size + fade) is measured with an
  // elliptical normal so it varies continuously along straight edges.
  vec2 hs = max(uHalfSize, vec2(1.0, 1.0));
  vec2 nEll = normalize(p / (hs * hs) + 1e-5);
  float dotVal = clamp(abs(dot(nEll, L)), 0.0, 1.0);
  if (isnan(dotVal) || isinf(dotVal)) dotVal = 0.0;
  float phi = acos(dotVal);
  if (isnan(phi) || isinf(phi)) phi = 0.0;
  float rim = 1.0 - smoothstep(uShineSize - uShineFade, uShineSize + uShineFade + 1e-4, phi);
  float line = gaussianLine(d, uThickness);
  float edgeClamp = 1.0 - smoothstep(0.5 * uPx, 3.0 * uPx, abs(d));
  float hi = line * rim * edgeClamp * uIntensity;
  if (isnan(hi) || isinf(hi)) hi = 0.0;

  vec3 col = uBaseColor * base + uLineColor * hi;
  float a = clamp(base + hi, 0.0, 1.0);
  fragColor = vec4(col * a, a);
}
`;

const SpecularButton = ({
  children = 'Get Started',
  size = 'lg',
  radius = 18,
  tint = '#ffffff',
  tintOpacity = 0,
  blur = 0,
  textColor = '#f5f5f5',
  lineColor = '#ffffff',
  baseColor = '#525252',
  intensity = 1,
  shineSize = 10,
  shineFade = 40,
  thickness = 1,
  speed = 0.35,
  followMouse = true,
  proximity = 250,
  autoAnimate = false,
  disabled = false,
  onClick,
  className = '',
  type = 'button'
}) => {
  const btnRef = useRef(null);
  const fxRef = useRef(null);
  const propsRef = useRef({});

  propsRef.current = { radius, lineColor, baseColor, intensity, shineSize, shineFade, thickness, speed, followMouse, proximity, autoAnimate };

  useEffect(() => {
    const btn = btnRef.current;
    const fx = fxRef.current;
    if (!btn || !fx) return;

    let renderer;
    try {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer = new Renderer({ alpha: true, premultipliedAlpha: true, antialias: true, dpr });
    } catch (e) {
      console.warn('SpecularButton WebGL initialization skipped:', e);
      return;
    }

    const gl = renderer.gl;
    if (!gl) return;

    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.canvas.style.opacity = '0';
    gl.canvas.style.visibility = 'hidden';
    gl.canvas.style.backgroundColor = 'transparent';

    let isContextLost = false;
    const onContextLost = (e) => {
      e.preventDefault();
      isContextLost = true;
      gl.canvas.classList.remove('is-ready');
      gl.canvas.style.opacity = '0';
      gl.canvas.style.visibility = 'hidden';
      if (raf) cancelAnimationFrame(raf);
    };
    gl.canvas.addEventListener('webglcontextlost', onContextLost, false);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const geometry = new Triangle(gl);
    if (geometry.attributes.uv) delete geometry.attributes.uv;

    const program = new Program(gl, {
      vertex: VERT,
      fragment: FRAG,
      uniforms: {
        uCenter: { value: [0, 0] },
        uHalfSize: { value: [1, 1] },
        uRadius: { value: 0 },
        uAngle: { value: 2.4 },
        uPx: { value: dpr },
        uLineColor: { value: [1, 1, 1] },
        uBaseColor: { value: [0.32, 0.32, 0.32] },
        uIntensity: { value: 1 },
        uShineSize: { value: 0.17 },
        uShineFade: { value: 0.7 },
        uThickness: { value: 1 },
        uBaseWidth: { value: dpr }
      }
    });

    const mesh = new Mesh(gl, { geometry, program });
    let isAppended = false;

    const sizeRef = { w: 0, h: 0 };
    const resize = () => {
      if (!btn || isContextLost) return;
      const rect = btn.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      if (w <= 0 || h <= 0) return;
      sizeRef.w = w;
      sizeRef.h = h;
      renderer.setSize(w + PAD * 2, h + PAD * 2);
      program.uniforms.uCenter.value = [(PAD + w / 2) * dpr, (PAD + h / 2) * dpr];
      program.uniforms.uHalfSize.value = [Math.max((w / 2) * dpr, 1.0), Math.max((h / 2) * dpr, 1.0)];
    };
    const ro = new ResizeObserver(resize);
    ro.observe(btn);
    resize();

    let pointerAngle = null;
    let proximityT = 0;
    const onPointerMove = e => {
      if (!btn || isContextLost) return;
      const rect = btn.getBoundingClientRect();
      if (!rect.width || !rect.height || rect.width <= 0 || rect.height <= 0) return;

      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = Math.max(rect.left - e.clientX, 0, e.clientX - rect.right);
      const dy = Math.max(rect.top - e.clientY, 0, e.clientY - rect.bottom);
      const dist = Math.hypot(dx, dy);

      if (dist === 0) {
        const halfW = Math.max(rect.width / 2, 1);
        const halfH = Math.max(rect.height / 2, 1);
        const nx = (e.clientX - cx) / halfW;
        const ny = (cy - e.clientY) / halfH;
        pointerAngle = Math.atan2(2 / halfH, -2 / halfW) + nx * 0.3 + ny * 0.15;
      } else {
        pointerAngle = Math.atan2(cy - e.clientY, e.clientX - cx);
      }
      if (isNaN(pointerAngle)) pointerAngle = 2.4;

      const prox = Math.max(propsRef.current.proximity || 250, 1);
      const t = Math.max(0, 1 - dist / prox);
      proximityT = t * t * (3 - 2 * t);
    };
    window.addEventListener('pointermove', onPointerMove);

    let angle = 2.4;
    let idleAngle = 2.4;
    let bright = 0;
    let last = performance.now();
    let raf = 0;

    const lineC = new Color();
    const baseC = new Color();

    const update = now => {
      if (isContextLost) return;
      raf = requestAnimationFrame(update);

      if (sizeRef.w <= 0 || sizeRef.h <= 0) {
        resize();
        if (sizeRef.w <= 0 || sizeRef.h <= 0) return;
      }

      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const p = propsRef.current;

      idleAngle += (p.speed || 0.35) * dt;
      const steer = p.followMouse && pointerAngle != null && !isNaN(pointerAngle) && (!p.autoAnimate || proximityT > 0);
      const target = steer ? pointerAngle : idleAngle;
      const safeTarget = isNaN(target) ? 2.4 : target;
      const diff = ((safeTarget - angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      if (!isNaN(diff)) {
        angle += diff * (1 - Math.exp(-dt * 7));
      }
      if (isNaN(angle)) angle = 2.4;

      const brightTarget = p.autoAnimate ? 1 : proximityT;
      bright += (brightTarget - bright) * (1 - Math.exp(-dt * 8));
      if (isNaN(bright)) bright = 0;

      lineC.set(p.lineColor || '#ffffff');
      baseC.set(p.baseColor || '#525252');
      program.uniforms.uAngle.value = angle;
      const halfMin = Math.min(sizeRef.w, sizeRef.h) / 2;
      const radiusVal = Math.min(p.radius || 18, halfMin) * dpr;
      program.uniforms.uRadius.value = isNaN(radiusVal) ? 0 : Math.max(0, radiusVal);
      program.uniforms.uLineColor.value = [lineC.r, lineC.g, lineC.b];
      program.uniforms.uBaseColor.value = [baseC.r, baseC.g, baseC.b];
      program.uniforms.uIntensity.value = Math.max(0, (p.intensity || 1) * bright);
      program.uniforms.uShineSize.value = ((p.shineSize || 10) * Math.PI) / 180;
      program.uniforms.uShineFade.value = ((p.shineFade || 40) * Math.PI) / 180;
      program.uniforms.uThickness.value = (p.thickness || 1) * dpr;
      try {
        renderer.render({ scene: mesh });
        if (!isAppended && fx && sizeRef.w > 0 && sizeRef.h > 0) {
          fx.appendChild(gl.canvas);
          isAppended = true;
          // Defer visibility by 2 RAFs so the WebGL texture has fully swapped
          // into the hardware compositor backbuffer before becoming visible
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (gl.canvas && !isContextLost) {
                gl.canvas.classList.add('is-ready');
              }
            });
          });
        }
      } catch (err) {
        // Suppress any render errors on context loss
      }
    };
    raf = requestAnimationFrame(update);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      gl.canvas.removeEventListener('webglcontextlost', onContextLost);
      gl.canvas.classList.remove('is-ready');
      gl.canvas.style.opacity = '0';
      gl.canvas.style.visibility = 'hidden';
      if (gl.canvas.parentNode) gl.canvas.parentNode.removeChild(gl.canvas);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, []);

  return (
    <button
      ref={btnRef}
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`specular-button specular-button--${size}${className ? ` ${className}` : ''}`}
      style={{
        backgroundColor: '#1e201b',
        background: '#1e201b',
        borderRadius: `${radius}px`,
        '--sb-radius': `${radius}px`,
        '--sb-tint': tint,
        '--sb-tint-opacity': tintOpacity,
        '--sb-blur': `${blur}px`,
        '--sb-text-color': textColor
      }}
    >
      <span ref={fxRef} className="specular-button__fx" aria-hidden="true" />
      <span className="specular-button__label">{children}</span>
    </button>
  );
};

export default SpecularButton;
