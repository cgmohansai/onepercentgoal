import React, { useRef, useEffect } from 'react'

// ============================================================================
// WebGL LiquidMetal Shader Wrapper Component
// ============================================================================
export const LiquidMetal = React.memo(function LiquidMetal({
  colorBack = "#343630",
  colorTint = "#c9f36a",
  speed = 0.4,
  repetition = 4,
  distortion = 0.15,
  scale = 1,
  className,
  style
}) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl')
    if (!gl) return

    const hexToRgb = (hex) => {
      const num = parseInt(hex.replace("#", ""), 16)
      return [
        ((num >> 16) & 255) / 255,
        ((num >> 8) & 255) / 255,
        (num & 255) / 255
      ]
    }

    const rgbBack = hexToRgb(colorBack)
    const rgbTint = hexToRgb(colorTint)

    const vsSource = `
      attribute vec2 position;
      void main() {
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `

    const fsSource = `
      precision highp float;
      uniform vec2 u_resolution;
      uniform float u_time;
      uniform vec3 u_colorBack;
      uniform vec3 u_colorTint;
      uniform float u_speed;
      uniform float u_repetition;
      uniform float u_distortion;

      void main() {
        vec2 uv = gl_FragCoord.xy / u_resolution.xy;
        vec2 p = uv * u_repetition - u_repetition * 0.5;
        float t = u_time * u_speed;
        for(float i = 1.0; i < 5.0; i++) {
          p.x += sin(p.y + t + i * 0.8) * u_distortion;
          p.y += cos(p.x + t + i * 0.5) * u_distortion;
        }
        float light = sin(p.x + p.y) * 0.5 + 0.5;
        vec3 color = mix(u_colorBack, u_colorTint, light);
        color.r += sin(light * 5.0) * 0.08;
        color.b += cos(light * 5.0) * 0.08;
        gl_FragColor = vec4(color, 1.0);
      }
    `

    const createShader = (gl, type, source) => {
      const shader = gl.createShader(type)
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      return shader
    }

    const vs = createShader(gl, gl.VERTEX_SHADER, vsSource)
    const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource)

    const program = gl.createProgram()
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)
    gl.useProgram(program)

    const positionBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,  1, -1, -1,  1,
      -1,  1,  1, -1,  1,  1
    ]), gl.STATIC_DRAW)

    const positionLoc = gl.getAttribLocation(program, 'position')
    gl.enableVertexAttribArray(positionLoc)
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0)

    const resLoc = gl.getUniformLocation(program, 'u_resolution')
    const timeLoc = gl.getUniformLocation(program, 'u_time')
    const cbLoc = gl.getUniformLocation(program, 'u_colorBack')
    const ctLoc = gl.getUniformLocation(program, 'u_colorTint')
    const spLoc = gl.getUniformLocation(program, 'u_speed')
    const repLoc = gl.getUniformLocation(program, 'u_repetition')
    const distLoc = gl.getUniformLocation(program, 'u_distortion')

    let animationFrameId
    const startTime = performance.now()

    const resize = () => {
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
        gl.viewport(0, 0, width, height)
      }
    }

    const render = () => {
      resize()
      gl.uniform2f(resLoc, canvas.width, canvas.height)
      gl.uniform1f(timeLoc, (performance.now() - startTime) / 1000)
      gl.uniform3fv(cbLoc, rgbBack)
      gl.uniform3fv(ctLoc, rgbTint)
      gl.uniform1f(spLoc, speed)
      gl.uniform1f(repLoc, repetition)
      gl.uniform1f(distLoc, distortion)

      gl.drawArrays(gl.TRIANGLES, 0, 6)
      animationFrameId = requestAnimationFrame(render)
    }

    render()

    return () => {
      cancelAnimationFrame(animationFrameId)
      gl.bindBuffer(gl.ARRAY_BUFFER, null)
      gl.deleteBuffer(positionBuffer)
      gl.deleteProgram(program)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
    }
  }, [colorBack, colorTint, speed, repetition, distortion])

  return (
    <div
      className={className}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 0,
        overflow: 'hidden',
        ...style
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block'
        }}
      />
    </div>
  )
})

// ============================================================================
// Premium button with WebGL liquid metal border effect
// ============================================================================
export const LiquidMetalButton = React.forwardRef(function LiquidMetalButton({
  children,
  icon,
  borderWidth = 4,
  metalConfig,
  size = "md",
  className,
  disabled,
  style,
  ...props
}, ref) {
  const sizeStyles = {
    sm: { padding: '8px 24px 8px 8px', gap: '12px', fontSize: '13px' },
    md: { padding: '12px 32px 12px 12px', gap: '16px', fontSize: '16px' },
    lg: { padding: '16px 40px 16px 16px', gap: '24px', fontSize: '18px' },
  }

  const iconSizes = {
    sm: { width: '32px', height: '32px' },
    md: { width: '40px', height: '40px' },
    lg: { width: '48px', height: '48px' },
  }

  return (
    <button
      ref={ref}
      disabled={disabled}
      className={`liquid-metal-btn-trigger ${className || ''}`}
      style={{
        position: 'relative',
        cursor: disabled ? 'not-allowed' : 'pointer',
        border: 'none',
        background: 'transparent',
        padding: 0,
        outline: 'none',
        transition: 'transform 0.15s ease',
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
        ...style
      }}
      {...props}
    >
      <div
        style={{
          position: 'relative',
          borderRadius: '9999px',
          overflow: 'hidden',
          boxShadow: '0 20px 50px -12px rgba(0,0,0,0.4)',
          padding: borderWidth
        }}
      >
        {/* Liquid Metal Border Layer */}
        <LiquidMetal
          colorBack={metalConfig?.colorBack ?? "#343630"}
          colorTint={metalConfig?.colorTint ?? "#c9f36a"}
          speed={metalConfig?.speed ?? 0.4}
          repetition={metalConfig?.repetition ?? 4}
          distortion={metalConfig?.distortion ?? 0.15}
          scale={metalConfig?.scale ?? 1}
          style={{ borderRadius: '9999px' }}
        />

        {/* Inner Button Body */}
        <div
          className="liquid-metal-btn-body"
          style={{
            position: 'relative',
            zIndex: 10,
            borderRadius: '9999px',
            display: 'flex',
            alignItems: 'center',
            background: '#151714',
            border: '1px solid rgba(201, 243, 106, 0.1)',
            transition: 'background-color 0.2s ease, border-color 0.2s ease',
            ...sizeStyles[size]
          }}
        >
          {icon && (
            <div
              style={{
                borderRadius: '9999px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#242721',
                boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)',
                ...iconSizes[size]
              }}
            >
              <span style={{ color: '#c9f36a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {icon}
              </span>
            </div>
          )}
          <span style={{
            fontWeight: 600,
            letterSpacing: '-0.025em',
            color: '#eef0e9'
          }}>
            {children}
          </span>
        </div>
      </div>
    </button>
  )
})

export default LiquidMetalButton
