const query = 'leaf';
const page = 1;
const accessKey = 'BnoeapJpelCj7CGsYpFYRLhbI1fRsOoLGqGvU8HNYVpyFkI4OpCOCyn6';
const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=10&page=${page}`;
console.log(url);
fetch(url, { headers: { Authorization: accessKey }, cache: 'no-store' })
  .then(res => res.json())
  .then(data => console.log(data.photos.map(p => p.alt)));
