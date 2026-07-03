const rawSvg = 'd="M 100 200 c 10 20 30 40 50 60 h 20 v 30 Z"';
const tx = x => x * 2;
const ty = y => y * 3;

const out = rawSvg.replace(/d="([^"]+)"/g, (match, d) => {
    const commands = d.match(/[a-zA-Z][^a-zA-Z]*/g) || [];
    let outArr = [];
    let curX = 0, curY = 0;

    for (const cmdStr of commands) {
      const type = cmdStr[0];
      const args = cmdStr.slice(1).trim().match(/[-+]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/g);
      const nums = args ? args.map(parseFloat) : [];
      
      let newCmd = type.toUpperCase();
      const newNums = [];
      let isFirst = true;
      let i = 0;

      if (type === 'Z' || type === 'z') {
        outArr.push('Z');
        continue;
      }

      while (i < nums.length) {
        if (type === 'M' || type === 'L' || type === 'm' || type === 'l') {
           let effType = (type === 'M' || type === 'm') && isFirst ? 'M' : 'L';
           if (type === 'm' || type === 'l') { curX += nums[i]; curY += nums[i+1]; }
           else { curX = nums[i]; curY = nums[i+1]; }
           newNums.push(tx(curX).toFixed(1), ty(curY).toFixed(1));
           if (isFirst) newCmd = effType;
           i += 2;
        } else if (type === 'H' || type === 'h') {
           if (type === 'h') curX += nums[i]; else curX = nums[i];
           newNums.push(tx(curX).toFixed(1));
           if (isFirst) newCmd = 'H';
           i += 1;
        } else if (type === 'V' || type === 'v') {
           if (type === 'v') curY += nums[i]; else curY = nums[i];
           newNums.push(ty(curY).toFixed(1));
           if (isFirst) newCmd = 'V';
           i += 1;
        } else if (type === 'C' || type === 'c') {
           let x1 = nums[i], y1 = nums[i+1], x2 = nums[i+2], y2 = nums[i+3], x3 = nums[i+4], y3 = nums[i+5];
           if (type === 'c') { x1 += curX; y1 += curY; x2 += curX; y2 += curY; x3 += curX; y3 += curY; }
           newNums.push(tx(x1).toFixed(1), ty(y1).toFixed(1), tx(x2).toFixed(1), ty(y2).toFixed(1), tx(x3).toFixed(1), ty(y3).toFixed(1));
           curX = x3; curY = y3;
           if (isFirst) newCmd = 'C';
           i += 6;
        } else {
           break;
        }
        isFirst = false;
      }
      outArr.push(newCmd + (newNums.length ? ' ' + newNums.join(' ') : ''));
    }
    return `d="${outArr.join(' ')}"`;
});
console.log(out);
