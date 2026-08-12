/**
 * Whether WebGL on this machine is being rendered in software.
 *
 * Why this exists: the hero's animated line field costs almost nothing on a
 * real GPU and is catastrophic without one. Measured on the same build and the
 * same URL, Lighthouse desktop scored **92 with hardware acceleration and 57
 * without** — total blocking time 180 ms against 35,970 ms, and 294 ms of
 * main-thread "other" work against 43,774 ms. A 148× difference, entirely from
 * the shader falling back to SwiftShader.
 *
 * That is not a hypothetical: PageSpeed Insights runs without GPU acceleration,
 * so it is the score the public sees. So does any visitor whose GPU Chrome has
 * blocklisted — old drivers, virtual machines, remote desktop sessions.
 *
 * Deliberately a renderer-string check rather than a frame-timing probe. Timing
 * the first few frames would be more direct, but it can only decide *after*
 * spending them, and on software GL a single frame is already long enough to be
 * the problem.
 */

/** Software renderers, as they name themselves in `UNMASKED_RENDERER_WEBGL`. */
const SOFTWARE_RENDERERS =
  /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic|generic renderer/i;

export function isSoftwareWebGL(): boolean {
  if (typeof document === "undefined") return false;

  let gl: WebGLRenderingContext | null = null;

  try {
    const canvas = document.createElement("canvas");
    gl = canvas.getContext("webgl") as WebGLRenderingContext | null;

    // No WebGL at all: nothing to animate, so the caller should skip. Reported
    // as "software" because both answers lead to the same decision, and one
    // boolean is easier to reason about than two.
    if (!gl) return true;

    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = info
      ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL) ?? "")
      : "";

    // The renderer string is unavailable — Safari removed this extension for
    // fingerprinting reasons, and Firefox withholds it under
    // resistFingerprinting. Assume HARDWARE here, and the asymmetry is
    // deliberate: guessing "software" would silently drop the animation for
    // every Safari visitor, including every Mac and iPhone, where the GPU is
    // excellent. Guessing "hardware" only fails for a privacy-hardened browser
    // that also lacks a GPU, which is a much smaller population than "all of
    // Safari". SwiftShader IS detectable in Chromium, which is where both
    // PageSpeed and the GPU blocklist actually live.
    if (!renderer) return false;

    return SOFTWARE_RENDERERS.test(renderer);
  } catch {
    // A throwing context probe is itself a bad sign; skip the animation.
    return true;
  } finally {
    // Release the probe context rather than leaving it to the GC. Browsers cap
    // live WebGL contexts (~16 in Chrome) and silently kill the oldest when the
    // cap is hit — which would be the hero's own context.
    try {
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      // Nothing useful to do; the probe context is one frame of work at worst.
    }
  }
}
