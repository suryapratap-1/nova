// 3D simplex noise (Ashima Arts / Stefan Gustavson, public domain)
export const SIMPLEX = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

/* ---------------------------------------------------------------- glass sculpture */
export const sculptVert = /* glsl */ `
uniform float uTime; uniform float uAmp; uniform vec2 uPointer;
varying vec3 vN; varying vec3 vView; varying float vD;
${SIMPLEX}
float field(vec3 p){
  vec3 o = vec3(uTime*.22 + uPointer.x*.35, uTime*.17 + uPointer.y*.35, uTime*.05);
  return (snoise(p*.85 + o) + .28*snoise(p*2.1 - o*1.4)) * uAmp;
}
vec3 displace(vec3 p){ vec3 n = normalize(p); return p + n * field(n * 1.5); }
void main(){
  vec3 n = normalize(position);
  vec3 up = abs(n.y) > .99 ? vec3(1.,0.,0.) : vec3(0.,1.,0.);
  vec3 t = normalize(cross(n, up)); vec3 b = cross(n, t);
  float e = .012;
  vec3 P = displace(position), Pt = displace(position + t*e), Pb = displace(position + b*e);
  vec3 N = normalize(cross(Pt - P, Pb - P));
  if (dot(N, n) < 0.) N = -N;
  vD = field(n * 1.5);
  vec4 wp = modelMatrix * vec4(P, 1.);
  vN = normalize(mat3(modelMatrix) * N);
  vView = cameraPosition - wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

export const sculptFrag = /* glsl */ `
uniform float uTime; uniform vec3 uLight; uniform float uGlow;
varying vec3 vN; varying vec3 vView; varying float vD;
vec3 pal(float t){ return .5 + .5*cos(6.28318*(t + vec3(0., .33, .67))); }
void main(){
  vec3 N = normalize(vN), V = normalize(vView);
  float ndv = max(dot(N, V), 0.);
  float fr = pow(1. - ndv, 2.6);
  vec3 violet = vec3(.32, .2, 1.), cyan = vec3(.18, .75, 1.);
  vec3 irid = mix(pal(ndv*1.1 + vD*1.8 + uTime*.04), mix(violet, cyan, smoothstep(-.3, .3, vD)), .55);
  vec3 R = reflect(-V, N);
  vec3 L = normalize(uLight);
  float soft = smoothstep(.6, .98, R.y) * .3;               // overhead softbox
  float key  = smoothstep(.9, .998, dot(R, L)) * 1.1;          // cursor-driven light streak
  float spec = pow(max(dot(N, normalize(L + V)), 0.), 120.) * 1.2;
  vec3 col = vec3(.012, .01, .03);
  col += irid * fr * 1.6;
  col += (soft + key) * mix(vec3(1.), irid, .5) * (.2 + fr);
  col += vec3(spec);
  col += mix(violet, cyan, .3) * uGlow * (.25 + .75*(1. - fr));
  gl_FragColor = vec4(col, 1.);
}`;

/* ---------------------------------------------------------------- morphing particles */
export const partVert = /* glsl */ `
uniform float uMorph; uniform float uTime; uniform float uSize; uniform float uPixel;
attribute vec3 aA; attribute vec3 aB; attribute vec3 aC; attribute vec3 aD; attribute vec3 aE; attribute vec4 aR;
varying float vA; varying vec3 vCol;
vec3 shapeAt(float i){ return i < .5 ? aA : i < 1.5 ? aB : i < 2.5 ? aC : i < 3.5 ? aD : aE; }
void main(){
  float m = clamp(uMorph, 0., 4.);
  float i = min(floor(m), 3.);
  float f = m - i;
  float t = clamp((f - aR.x*.35) / .65, 0., 1.);
  t = t*t*(3. - 2.*t);
  vec3 p = mix(shapeAt(i), shapeAt(i + 1.), t);
  float mid = sin(t * 3.14159);
  p += (aR.yzw - .5) * mid * 2.2;                               // swirl apart between shapes
  float wave = 1. - clamp(abs(m - 3.), 0., 1.);
  p.y += sin(p.x*.55 + uTime*1.2) * cos(p.z*.45 + uTime*.8) * .45 * wave;
  p += .07 * vec3(sin(uTime*.7 + aR.y*40.), cos(uTime*.6 + aR.z*40.), sin(uTime*.5 + aR.w*40.));
  vec4 mv = modelViewMatrix * vec4(p, 1.);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * uPixel * (.5 + aR.y) / -mv.z;
  vA = .3 + .7*aR.z;
  vCol = aR.w > .95 ? vec3(.75, 1., .3) : mix(vec3(.38, .26, 1.), vec3(.25, .85, 1.), aR.w / .95);
}`;

export const partFrag = /* glsl */ `
uniform float uOpacity;
varying float vA; varying vec3 vCol;
void main(){
  float d = length(gl_PointCoord - .5);
  float a = smoothstep(.5, .0, d);
  gl_FragColor = vec4(vCol * (1. + a), a * a * vA * uOpacity);
}`;

/* ---------------------------------------------------------------- backdrop */
export const skyVert = /* glsl */ `
varying vec3 vDir;
void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`;

export const skyFrag = /* glsl */ `
varying vec3 vDir;
void main(){
  vec3 c = vec3(.006, .005, .012);
  float a = max(0., dot(vDir, normalize(vec3(-.5, .55, -.65))));
  float b = max(0., dot(vDir, normalize(vec3(.7, -.35, -.6))));
  c += vec3(.11, .05, .3) * pow(a, 6.) * .9;
  c += vec3(.02, .1, .16) * pow(b, 8.) * .6;
  gl_FragColor = vec4(c, 1.);
}`;

/* ---------------------------------------------------------------- final grade */
export const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uT: { value: 0 }, uRes: { value: null } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uT; uniform vec2 uRes; varying vec2 vUv;
    void main(){
      vec2 d = vUv - .5; float r2 = dot(d, d);
      float ca = .0016 * (.2 + r2 * 2.6);
      vec3 c = vec3(texture2D(tDiffuse, vUv + d*ca).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - d*ca).b);
      float l = dot(c, vec3(.2126, .7152, .0722));
      c = mix(c, c * vec3(.86, .9, 1.12), smoothstep(.45, 0., l) * .5);
      c *= smoothstep(1.25, .3, length(d * vec2(1., .9)) * 1.35) * .45 + .55;
      c += (fract(sin(dot(vUv * uRes + uT * 91.7, vec2(12.9898, 78.233))) * 43758.5453) - .5) * .018;
      gl_FragColor = vec4(c, 1.);
    }`
};
