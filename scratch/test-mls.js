function mlsDeform(v, P, Q, alpha=1) {
  let sumW = 0;
  let pStarX = 0, pStarY = 0;
  let qStarX = 0, qStarY = 0;
  let weights = [];
  
  for (let i = 0; i < P.length; i++) {
    let dx = P[i].x - v.x;
    let dy = P[i].y - v.y;
    let distSq = dx*dx + dy*dy;
    if (distSq < 1e-8) return {x: Q[i].x, y: Q[i].y}; // exact match
    let w = 1.0 / Math.pow(distSq, alpha);
    weights.push(w);
    sumW += w;
    pStarX += w * P[i].x; pStarY += w * P[i].y;
    qStarX += w * Q[i].x; qStarY += w * Q[i].y;
  }
  
  pStarX /= sumW; pStarY /= sumW;
  qStarX /= sumW; qStarY /= sumW;
  
  let mu = 0;
  for (let i = 0; i < P.length; i++) {
    let phatX = P[i].x - pStarX;
    let phatY = P[i].y - pStarY;
    mu += weights[i] * (phatX*phatX + phatY*phatY);
  }
  
  let vxHat = v.x - pStarX;
  let vyHat = v.y - pStarY;
  
  let resultX = 0, resultY = 0;
  for (let i = 0; i < P.length; i++) {
    let phatX = P[i].x - pStarX;
    let phatY = P[i].y - pStarY;
    let qhatX = Q[i].x - qStarX;
    let qhatY = Q[i].y - qStarY;
    
    // A_i = w_i * ( phatX qhatX + phatY qhatY )
    // B_i = w_i * ( phatX qhatY - phatY qhatX )
    let A = weights[i] * (phatX * qhatX + phatY * qhatY);
    let B = weights[i] * (phatX * qhatY - phatY * qhatX);
    
    resultX += A * vxHat - B * vyHat;
    resultY += B * vxHat + A * vyHat;
  }
  
  return {
    x: qStarX + resultX / mu,
    y: qStarY + resultY / mu
  };
}

let P = [{x: 10, y: 10}, {x: 100, y: 10}, {x: 10, y: 100}, {x: 100, y: 100}];
let Q = [{x: 10, y: 10}, {x: 150, y: 10}, {x: 10, y: 100}, {x: 150, y: 100}];
console.log(mlsDeform({x: 50, y: 50}, P, Q));
