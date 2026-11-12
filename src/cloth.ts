/**
 * "Grab the garment" effect.
 *
 * The product photo is mapped onto a grid mesh (WebGL2) that is simulated as real 3D cloth:
 *  - every vertex has x, y AND z, and neighbouring vertices keep their distance (structure, shear and bend
 *    constraints). Fabric therefore cannot stretch like rubber: when it is pulled it swings, bends, folds and
 *    turns edge-on (a sleeve flapping over the chest becomes a thin ribbon), exactly like a real sweater.
 *  - the hook/hanger stay pinned, and every vertex is gently pulled back to its hanging position,
 *  - while the mouse is held, vertices near the grab point are pulled along with the cursor,
 *  - the whole garment also swings like a pendulum around the hook, so it leans toward the cursor and wobbles
 *    back when released,
 *  - triangles are drawn back-to-front and lit by their normal, so folds read as folds and overlap correctly.
 */

export interface Pose {
  /** horizontal position of the hook on the stage (design px, 0 = stage centre) */
  x: number
  /** rotateY of the photo (deg), as used by the rail's own 3D turn / showcase swing */
  rotY: number
  /** rotateZ (deg): the hanger's idle sway */
  rotZ: number
}

export interface SetupOptions {
  image: HTMLImageElement
  /** sprite size in design px */
  w: number
  h: number
  hookX: number
  /** extra scale (side-only pieces are shown slightly zoomed) and mirroring, baked into the rest shape */
  scale: number
  flip: 1 | -1
  pixelRatio: number
  getPose: () => Pose
  /** optional tears: columns (0..1 across the photo) along which the fabric is cut below `cutFrom` (0..1 down the photo) */
  cuts?: number[]
  cutFrom?: number
}

const PAD = 120 // room around the sprite for stretched cloth
const PAD_TOP = 24
const STEP = 1 / 60
const PERSPECTIVE = 1000 // same as transformPerspective used on the rail photos

const VS = `#version 300 es
in vec2 aPos; in vec2 aUv; in float aShade;
uniform vec2 uSize;
out vec2 vUv; out float vShade;
void main() {
  vUv = aUv; vShade = aShade;
  gl_Position = vec4(aPos.x / uSize.x * 2.0 - 1.0, 1.0 - aPos.y / uSize.y * 2.0, 0.0, 1.0);
}`
const FS = `#version 300 es
precision mediump float;
in vec2 vUv; in float vShade;
uniform sampler2D uTex;
out vec4 outColor;
void main() {
  vec4 c = texture(uTex, vUv);
  outColor = vec4(min(c.rgb * vShade, vec3(c.a)), c.a); // texture is premultiplied
}`

const smooth = (a: number, b: number, v: number) => {
  const x = Math.min(1, Math.max(0, (v - a) / (b - a)))
  return x * x * (3 - 2 * x)
}

export class ClothGrab {
  readonly ok: boolean
  grabbing = false
  /** true from setup() until the cloth has come to rest after release */
  active = false
  itemKey = ''

  private canvas: HTMLCanvasElement
  private gl: WebGL2RenderingContext | null
  private prog: WebGLProgram | null = null
  private vao: WebGLVertexArrayObject | null = null
  private vbo: WebGLBuffer | null = null
  private ibo: WebGLBuffer | null = null
  private tex: WebGLTexture | null = null
  private uSize: WebGLUniformLocation | null = null

  private n = 0
  private idxCount = 0
  private baseIdx = new Uint16Array(0)
  private idxSorted = new Uint16Array(0)
  private offS = { x: 0, y: 0 }
  private nbL = new Int32Array(0)
  private nbR = new Int32Array(0)
  private nbU = new Int32Array(0)
  private nbD = new Int32Array(0)
  private gi = new Int16Array(0)
  private gj = new Int16Array(0)
  private W = 0
  private H = 0
  private y0 = PAD_TOP
  private rest = new Float32Array(0) // x,y (z is 0 at rest)
  private tgt = new Float32Array(0)
  private p = new Float32Array(0) // x,y,z per vertex (stride 3)
  private prev = new Float32Array(0) // x,y,z
  private edges = new Uint16Array(0) // pairs of vertex ids
  private edgeLen = new Float32Array(0)
  private edgeK = new Float32Array(0)
  private order = new Uint32Array(0)
  private triDepth = new Float32Array(0)
  private zs = new Float32Array(0) // rotated z per vertex, for sorting + shading
  private lastOff = { x: 0, y: 0 }
  private kBase = new Float32Array(0)
  private infl = new Float32Array(0)
  private verts = new Float32Array(0)
  private pinned = new Uint8Array(0)

  private getPose: () => Pose = () => ({ x: 0, rotY: 0, rotZ: 0 })
  private p0 = { x: 0, y: 0 }
  private off = { x: 0, y: 0 }
  private phi = 0
  private phiVel = 0
  private acc = 0
  private calm = 0
  private h = 0
  private sigma = 40
  private time = 0

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: true })
    this.gl = gl
    this.ok = false
    if (!gl) return
    const prog = this.compile(gl)
    if (!prog) return
    this.prog = prog
    this.uSize = gl.getUniformLocation(prog, 'uSize')
    this.vao = gl.createVertexArray()
    this.vbo = gl.createBuffer()
    this.ibo = gl.createBuffer()
    this.tex = gl.createTexture()
    this.ok = true
  }

  private compile(gl: WebGL2RenderingContext) {
    const mk = (type: number, src: string) => {
      const s = gl.createShader(type)
      if (!s) return null
      gl.shaderSource(s, src)
      gl.compileShader(s)
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null
    }
    const vs = mk(gl.VERTEX_SHADER, VS)
    const fs = mk(gl.FRAGMENT_SHADER, FS)
    if (!vs || !fs) return null
    const prog = gl.createProgram()
    if (!prog) return null
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.bindAttribLocation(prog, 0, 'aPos')
    gl.bindAttribLocation(prog, 1, 'aUv')
    gl.bindAttribLocation(prog, 2, 'aShade')
    gl.linkProgram(prog)
    return gl.getProgramParameter(prog, gl.LINK_STATUS) ? prog : null
  }

  /** Build the mesh + texture for one product photo. Leaves the cloth at rest. */
  setup(o: SetupOptions, key: string) {
    const gl = this.gl
    if (!gl || !this.ok) return
    this.itemKey = key
    this.getPose = o.getPose
    const { w, h, hookX, scale, flip } = o
    this.h = h * scale
    this.sigma = 0.15 * Math.sqrt(w * h) * scale

    const ext = Math.max(hookX, w - hookX) * scale
    this.W = 2 * (ext + PAD)
    this.H = h * scale + PAD + PAD_TOP
    this.y0 = PAD_TOP
    const c = this.canvas
    c.style.width = `${this.W}px`
    c.style.height = `${this.H}px`
    c.width = Math.round(this.W * o.pixelRatio)
    c.height = Math.round(this.H * o.pixelRatio)
    gl.viewport(0, 0, c.width, c.height)

    const cols = Math.min(24, Math.max(10, Math.round(w / 13)))
    const rows = Math.min(32, Math.max(12, Math.round(h / 13)))
    const W1 = cols + 1

    // Optional tears: below row `jStart` the fabric is cut along the given columns, so a sleeve (or one leg of a
    // pair of trousers) can swing free of the body. Vertices on a cut are duplicated, one copy per side.
    const cutCols = (o.cuts ?? [])
      .map((u) => Math.round(u * cols))
      .filter((c) => c > 0 && c < cols)
      .sort((x, y) => x - y)
    const jStart = Math.min(rows - 1, Math.max(1, Math.round((o.cutFrom ?? 0.25) * rows)))
    const isCut = (i: number) => cutCols.includes(i)
    const pieceOfQuad = (qi: number) => cutCols.filter((c) => c <= qi).length
    const pieceOfNode = (i: number) => cutCols.filter((c) => c < i).length
    const nodeMap = new Map<number, number>()
    const nodeI: number[] = []
    const nodeJ: number[] = []
    const nodeP: number[] = []
    const nodeDup: boolean[] = []
    const keyOf = (i: number, j: number, p: number) => (j * W1 + i) * 8 + (j >= jStart && isCut(i) ? p + 1 : 0)
    const nodeId = (i: number, j: number, p: number) => {
      const key = keyOf(i, j, p)
      let id = nodeMap.get(key)
      if (id === undefined) {
        id = nodeI.length
        nodeMap.set(key, id)
        const dup = j >= jStart && isCut(i)
        nodeI.push(i)
        nodeJ.push(j)
        nodeP.push(dup ? p : pieceOfNode(i))
        nodeDup.push(dup)
      }
      return id
    }
    const tris: number[] = []
    const edgeSet = new Set<number>()
    const ev: number[] = []
    const ek: number[] = []
    const addEdge = (a: number, b: number, kk: number) => {
      const key = Math.min(a, b) * 65536 + Math.max(a, b)
      if (edgeSet.has(key)) return
      edgeSet.add(key)
      ev.push(a, b)
      ek.push(kk)
    }
    // distance constraints: structure (stiff), shear (medium), bend (soft)
    for (let qj = 0; qj < rows; qj++) {
      for (let qi = 0; qi < cols; qi++) {
        const pq = pieceOfQuad(qi)
        const a = nodeId(qi, qj, pq)
        const b = nodeId(qi + 1, qj, pq)
        const c = nodeId(qi, qj + 1, pq)
        const d = nodeId(qi + 1, qj + 1, pq)
        tris.push(a, b, c, b, d, c)
        addEdge(a, b, 0.9)
        addEdge(c, d, 0.9)
        addEdge(a, c, 0.9)
        addEdge(b, d, 0.9)
        addEdge(a, d, 0.55)
        addEdge(b, c, 0.55)
        if (qi + 1 < cols && pieceOfQuad(qi + 1) === pq) addEdge(a, nodeId(qi + 2, qj, pq), 0.25)
        if (qj + 1 < rows) addEdge(a, nodeId(qi, qj + 2, pq), 0.25)
      }
    }
    const n = nodeI.length
    this.n = n
    this.rest = new Float32Array(n * 2)
    this.tgt = new Float32Array(n * 2)
    this.p = new Float32Array(n * 3)
    this.prev = new Float32Array(n * 3)
    this.zs = new Float32Array(n)
    this.kBase = new Float32Array(n)
    this.infl = new Float32Array(n)
    this.pinned = new Uint8Array(n)
    this.verts = new Float32Array(n * 5)
    this.gi = Int16Array.from(nodeI)
    this.gj = Int16Array.from(nodeJ)

    for (let k = 0; k < n; k++) {
      const u = nodeI[k] / cols
      const v = nodeJ[k] / rows
      const x = (u * w - hookX) * scale * flip
      const y = v * h * scale
      this.rest[2 * k] = this.p[3 * k] = this.prev[3 * k] = this.tgt[2 * k] = x
      this.rest[2 * k + 1] = this.p[3 * k + 1] = this.prev[3 * k + 1] = this.tgt[2 * k + 1] = y
      this.verts[5 * k + 2] = u
      this.verts[5 * k + 3] = v
      // soft at the bottom, stiff near the hanger; hook + wire fully pinned
      this.kBase[k] = 0.05 + 0.45 * Math.exp(-Math.pow(y / (0.3 * h * scale), 2))
      this.pinned[k] = y < 22 ? 1 : 0
    }

    // neighbours used for lighting (never reach across a cut)
    const peek = (i: number, j: number, p: number) => nodeMap.get(keyOf(i, j, p))
    this.nbL = new Int32Array(n)
    this.nbR = new Int32Array(n)
    this.nbU = new Int32Array(n)
    this.nbD = new Int32Array(n)
    for (let k = 0; k < n; k++) {
      const i = nodeI[k]
      const j = nodeJ[k]
      const p = nodeP[k]
      let l = k
      let r = k
      if (i > 0) {
        const pq = pieceOfQuad(i - 1)
        if (!nodeDup[k] || pq === p) l = peek(i - 1, j, pq) ?? k
      }
      if (i < cols) {
        const pq = pieceOfQuad(i)
        if (!nodeDup[k] || pq === p) r = peek(i + 1, j, pq) ?? k
      }
      this.nbL[k] = l
      this.nbR[k] = r
      this.nbU[k] = j > 0 ? (peek(i, j - 1, p) ?? k) : k
      this.nbD[k] = j < rows ? (peek(i, j + 1, p) ?? k) : k
    }

    const idx = Uint16Array.from(tris)
    this.idxCount = idx.length
    this.order = new Uint32Array(idx.length / 3).map((_, t) => t)
    this.triDepth = new Float32Array(idx.length / 3)
    this.idxSorted = new Uint16Array(idx.length)
    this.edges = Uint16Array.from(ev)
    this.edgeK = Float32Array.from(ek)
    this.edgeLen = new Float32Array(ek.length)
    for (let e = 0; e < ek.length; e++) {
      const a = ev[2 * e]
      const b = ev[2 * e + 1]
      this.edgeLen[e] = Math.hypot(this.rest[2 * a] - this.rest[2 * b], this.rest[2 * a + 1] - this.rest[2 * b + 1])
    }

    gl.bindVertexArray(this.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo)
    gl.bufferData(gl.ARRAY_BUFFER, this.verts.byteLength, gl.DYNAMIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 20, 0)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 8)
    gl.enableVertexAttribArray(2)
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 20, 16)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.DYNAMIC_DRAW)
    this.baseIdx = idx

    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, o.image)
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    this.grabbing = false
    this.phi = 0
    this.phiVel = 0
    this.off = { x: 0, y: 0 }
    this.offS = { x: 0, y: 0 }
    this.lastOff = { x: 0, y: 0 }
    this.calm = 0
    this.acc = 0
    this.active = true
    this.render()
  }

  /** client coordinates -> hook-relative cloth coordinates */
  private local(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect()
    return {
      x: ((clientX - r.left) / r.width) * this.W - this.W / 2,
      y: ((clientY - r.top) / r.height) * this.H - this.y0,
    }
  }

  begin(clientX: number, clientY: number) {
    this.p0 = this.local(clientX, clientY)
    this.off = { x: 0, y: 0 }
    this.lastOff = { x: 0, y: 0 }
    this.grabbing = true
    this.active = true
    this.calm = 0
    // influence of the grab on each vertex: tight bump + wide bump, fading out near the hanger
    const s1 = this.sigma
    const s2 = s1 * 2.8
    for (let k = 0; k < this.n; k++) {
      const dx = this.p[3 * k] - this.p0.x
      const dy = this.p[3 * k + 1] - this.p0.y
      const d2 = dx * dx + dy * dy
      const g = 0.9 * Math.exp(-d2 / (2 * s1 * s1)) + 0.55 * Math.exp(-d2 / (2 * s2 * s2))
      this.infl[k] = this.pinned[k] ? 0 : Math.min(1, g) * smooth(24, 90, this.rest[2 * k + 1])
    }
  }

  move(clientX: number, clientY: number) {
    if (!this.grabbing) return
    const c = this.local(clientX, clientY)
    const dx = c.x - this.p0.x
    const dy = c.y - this.p0.y
    const m = Math.hypot(dx, dy)
    const L = 0.34 * Math.min(this.W, this.H) // soft limit: the cloth can only be stretched so far
    const k = m > 0 ? (L * Math.tanh(m / L)) / m : 0
    this.off = { x: dx * k, y: dy * k }
  }

  release() {
    this.grabbing = false
    this.off = { x: 0, y: 0 }
    this.calm = 0
  }

  /** advance the simulation by `dt` seconds */
  step(dt: number) {
    this.acc += Math.min(dt, 0.1)
    while (this.acc >= STEP) {
      this.acc -= STEP
      this.substep()
    }
  }

  private substep() {
    const { n, p, prev, tgt, rest, kBase, infl, pinned, edges, edgeLen, edgeK, gi, gj } = this
    this.time += STEP
    // ease the raw cursor offset so hand jitter / low pointer rates never reach the cloth
    this.offS.x += (this.off.x - this.offS.x) * 0.2
    this.offS.y += (this.off.y - this.offS.y) * 0.2

    // pendulum around the hook: lean toward the cursor, wobble back when released
    const phiTarget = this.grabbing ? Math.max(-0.5, Math.min(0.5, (-this.offS.x / this.h) * 0.6)) : 0
    const phiAcc = -120 * (this.phi - phiTarget) - 7 * this.phiVel
    this.phiVel += phiAcc * STEP
    this.phi += this.phiVel * STEP
    const cs = Math.cos(this.phi)
    const sn = Math.sin(this.phi)

    // how fast the cursor is moving the cloth right now -> out-of-plane kick (this is what makes it fold, not stretch)
    const ovx = this.offS.x - this.lastOff.x
    const ovy = this.offS.y - this.lastOff.y
    this.lastOff = { x: this.offS.x, y: this.offS.y }
    const speed = this.grabbing ? Math.hypot(ovx, ovy) : 0

    // 1) integrate: every point is pulled back to where it hangs (plus the grab), keeps its velocity
    for (let k = 0; k < n; k++) {
      const rx = rest[2 * k]
      const ry = rest[2 * k + 1]
      let gx = rx * cs - ry * sn
      let gy = rx * sn + ry * cs
      const g = this.grabbing ? infl[k] : 0
      gx += this.offS.x * 0.6 * g
      gy += this.offS.y * 0.6 * g
      tgt[2 * k] = gx
      tgt[2 * k + 1] = gy
      const o = 3 * k
      if (pinned[k]) {
        p[o] = prev[o] = rx
        p[o + 1] = prev[o + 1] = ry
        p[o + 2] = prev[o + 2] = 0
        continue
      }
      const ke = Math.min(0.85, kBase[k] + 0.4 * g)
      const vx = (p[o] - prev[o]) * 0.95
      const vy = (p[o + 1] - prev[o + 1]) * 0.95
      const vz = (p[o + 2] - prev[o + 2]) * 0.93
      prev[o] = p[o]
      prev[o + 1] = p[o + 1]
      prev[o + 2] = p[o + 2]
      p[o] += vx + (gx - p[o]) * ke
      p[o + 1] += vy + (gy - p[o + 1]) * ke
      p[o + 2] += vz - p[o + 2] * (0.03 + kBase[k] * 0.35)
      if (speed > 0.02 && g > 0.02) {
        const i = gi[k]
        const j = gj[k]
        // low-frequency "buckling" pattern, biased toward the viewer so the sleeve flaps in front of the body
        p[o + 2] += Math.min(14, speed) * 0.55 * g * (0.55 + 0.45 * Math.sin(i * 0.62 + j * 0.47))
      }
    }

    // 2) fabric does not stretch: restore neighbour distances in 3D. Whatever the pull cannot do in-plane
    //    ends up as depth, i.e. folds.
    for (let it = 0; it < 6; it++) {
      for (let e = 0; e < edgeK.length; e++) {
        const a = edges[2 * e]
        const b = edges[2 * e + 1]
        const wa = pinned[a] ? 0 : 1
        const wb = pinned[b] ? 0 : 1
        if (wa + wb === 0) continue
        const ao = 3 * a
        const bo = 3 * b
        const dx = p[bo] - p[ao]
        const dy = p[bo + 1] - p[ao + 1]
        const dz = p[bo + 2] - p[ao + 2]
        const d = Math.hypot(dx, dy, dz)
        if (d < 1e-5) continue
        const c = ((d - edgeLen[e]) / d) * edgeK[e]
        const sa = (wa / (wa + wb)) * c
        const sb = (wb / (wa + wb)) * c
        p[ao] += dx * sa
        p[ao + 1] += dy * sa
        p[ao + 2] += dz * sa
        p[bo] -= dx * sb
        p[bo + 1] -= dy * sb
        p[bo + 2] -= dz * sb
      }
    }

    let maxDev = 0
    let maxSpeed = 0
    for (let k = 0; k < n; k++) {
      const o = 3 * k
      if (p[o + 2] > 260) p[o + 2] = 260
      else if (p[o + 2] < -260) p[o + 2] = -260
      maxDev = Math.max(maxDev, Math.abs(p[o] - rest[2 * k]), Math.abs(p[o + 1] - rest[2 * k + 1]), Math.abs(p[o + 2]))
      maxSpeed = Math.max(maxSpeed, Math.abs(p[o] - prev[o]), Math.abs(p[o + 1] - prev[o + 1]), Math.abs(p[o + 2] - prev[o + 2]))
    }
    const still = maxDev < 0.35 && maxSpeed < 0.04 && Math.abs(this.phi) < 0.002 && Math.abs(this.phiVel) < 0.01
    this.calm = !this.grabbing && still ? this.calm + 1 : 0
  }

  /** at rest and not held */
  get settled() {
    return !this.grabbing && this.calm >= 12
  }

  render() {
    const gl = this.gl
    if (!gl || !this.ok || this.n === 0) return
    const { n, p, verts, zs, nbL, nbR, nbU, nbD } = this
    const pose = this.getPose()
    const ay = (pose.rotY * Math.PI) / 180
    const cy = Math.cos(ay)
    const sy = Math.sin(ay)
    const az = (pose.rotZ * Math.PI) / 180
    const cz = Math.cos(az)
    const sz = Math.sin(az)
    for (let k = 0; k < n; k++) {
      const x = p[3 * k]
      const y = p[3 * k + 1]
      const z = p[3 * k + 2]
      // same order as the CSS on the rail: rotateY (with perspective) first, then the hanger's rotateZ
      const xr = x * cy + z * sy
      const zr = Math.min(PERSPECTIVE * 0.8, -x * sy + z * cy)
      const f = PERSPECTIVE / (PERSPECTIVE - zr)
      const xs = xr * f
      const ys = y * f
      zs[k] = zr
      verts[5 * k] = this.W / 2 + xs * cz - ys * sz
      verts[5 * k + 1] = this.y0 + xs * sz + ys * cz
    }

    // lighting from the surface normal (light from the upper left, in front). Flat cloth = 1, so the resting
    // canvas matches the plain photo; folds facing the light get brighter, folds turned away get darker.
    const LX = -0.35
    const LY = -0.45
    const LZ = 0.82
    for (let k = 0; k < n; k++) {
      const a = 3 * nbL[k]
      const b = 3 * nbR[k]
      const c = 3 * nbU[k]
      const d = 3 * nbD[k]
      const ux = p[b] - p[a]
      const uy = p[b + 1] - p[a + 1]
      const uz = p[b + 2] - p[a + 2]
      const vx = p[d] - p[c]
      const vy = p[d + 1] - p[c + 1]
      const vz = p[d + 2] - p[c + 2]
      const nx = uy * vz - uz * vy
      const ny = uz * vx - ux * vz
      const nz = ux * vy - uy * vx
      const len = Math.hypot(nx, ny, nz) || 1
      const dot = Math.abs((nx * LX + ny * LY + nz * LZ) / len)
      let sh = 1 + 0.8 * (dot - LZ)
      if (nz < 0) sh *= 0.86 // we are looking at the inside of a fold
      verts[5 * k + 4] = Math.min(1.18, Math.max(0.5, sh))
    }

    // painter's algorithm: far triangles first, so a sleeve folded over the chest is drawn on top of it
    const base = this.baseIdx
    const tri = this.order.length
    const depth = this.triDepth
    let lo = Infinity
    let hi = -Infinity
    for (let t = 0; t < tri; t++) {
      const z = (zs[base[3 * t]] + zs[base[3 * t + 1]] + zs[base[3 * t + 2]]) / 3
      depth[t] = z
      if (z < lo) lo = z
      if (z > hi) hi = z
    }
    const sorted = this.idxSorted
    if (hi - lo < 0.5) {
      sorted.set(base)
    } else {
      const order = this.order
      order.sort((a, b) => depth[a] - depth[b])
      for (let m = 0; m < tri; m++) {
        const t = order[m]
        sorted[3 * m] = base[3 * t]
        sorted[3 * m + 1] = base[3 * t + 1]
        sorted[3 * m + 2] = base[3 * t + 2]
      }
    }

    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.useProgram(this.prog)
    gl.uniform2f(this.uSize, this.W, this.H)
    gl.bindVertexArray(this.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, verts)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo)
    gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, sorted)
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.drawElements(gl.TRIANGLES, this.idxCount, gl.UNSIGNED_SHORT, 0)

    this.canvas.style.transform = `translate3d(${pose.x}px,0,0)`
  }

  /** stage-space placement of the canvas (design px): left, top */
  placement(stageW: number, hangY: number) {
    return { left: stageW / 2 - this.W / 2, top: hangY - this.y0 }
  }

  stop() {
    this.active = false
    this.grabbing = false
  }
}
