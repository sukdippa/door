"use client";

// Ported from scroll-scene's DreamShader (a separate, non-R3F project — see
// its main.js) to @react-three/postprocessing's custom-Effect API. Same
// visual: radial swirl/blur, chromatic aberration, a vignette that tightens
// with progress, and a warm pulsing flash — driven by a uProgress uniform
// this file doesn't set itself (see R3FPathScene.tsx, which drives it off
// PATH_PORTAL_CONFIG + scroll progress).
//
// EffectAttribute.CONVOLUTION is required (not optional) here: it's what
// gets this effect its own render pass with the prior pass's `inputBuffer`
// sampler available, so mainImage can sample OTHER uv coordinates (for the
// swirl/aberration offsets) instead of only the current pixel's inputColor.

import { forwardRef, useMemo } from "react";
import { BlendFunction, Effect, EffectAttribute } from "postprocessing";
import { Uniform } from "three";

const portalSwirlFragmentShader = /* glsl */ `
  uniform float uProgress;
  uniform float uTime;

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec2 center = vec2(0.5);
    vec2 toCenter = center - uv;

    const int SAMPLES = 8;
    vec4 accum = vec4(0.0);

    for (int i = 0; i < SAMPLES; i++) {
      float t = float(i) / float(SAMPLES - 1);

      float scale = 1.0 - uProgress * 0.14 * t;
      vec2 rel = (uv - center) * scale;

      float angle = uProgress * 0.35 * t * sin(uTime * 0.4);
      float s = sin(angle);
      float c = cos(angle);
      vec2 rotated = vec2(rel.x * c - rel.y * s, rel.x * s + rel.y * c);

      accum += texture2D(inputBuffer, center + rotated);
    }

    accum /= float(SAMPLES);

    float ca = uProgress * 0.01;
    vec2 dir = normalize(toCenter + 0.0001);

    float r = texture2D(inputBuffer, uv + dir * ca).r;
    float g = accum.g;
    float b = texture2D(inputBuffer, uv - dir * ca).b;

    vec3 color = vec3(r, g, b);

    float dist = length(toCenter);
    float vig = smoothstep(0.9, 0.15, dist * (1.0 + uProgress * 0.7));
    color *= mix(1.0, vig, uProgress * 0.55);

    color += vec3(1.0, 0.95, 0.85) * pow(uProgress, 3.0) * 0.18 *
      (0.6 + 0.4 * sin(uTime * 1.3));

    outputColor = vec4(color, inputColor.a);
  }
`;

export class PortalSwirlEffectImpl extends Effect {
  constructor() {
    super("PortalSwirlEffect", portalSwirlFragmentShader, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.CONVOLUTION,
      uniforms: new Map([
        ["uProgress", new Uniform(0)],
        ["uTime", new Uniform(0)],
      ]),
    });
  }
}

const PortalSwirlEffect = forwardRef<PortalSwirlEffectImpl>(function PortalSwirlEffect(_props, ref) {
  const effect = useMemo(() => new PortalSwirlEffectImpl(), []);
  return <primitive ref={ref} object={effect} dispose={null} />;
});

export default PortalSwirlEffect;
