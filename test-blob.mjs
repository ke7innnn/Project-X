const buf = Buffer.from('test');
const blob = new Blob([new Uint8Array(buf)], { type: 'text/plain' });
console.log(blob.size, blob.type);
