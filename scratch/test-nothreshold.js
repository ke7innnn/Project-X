function test() {
  const S_max = 1.0;
  const SCALE_STEP = 0.005;
  const MAX_STEPS = Math.ceil(S_max / SCALE_STEP);
  console.log("MAX_STEPS:", MAX_STEPS);
  let broke = false;
  for (let si = 0; si <= MAX_STEPS; si++) {
    const scale = S_max - SCALE_STEP * si;
    if (scale <= 0) { broke = true; break; }
  }
  console.log("broke due to scale <= 0:", broke);
}
test();
