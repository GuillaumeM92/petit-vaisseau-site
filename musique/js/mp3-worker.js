// Encodes a rendered piece to MP3 off the page's thread, with LAME (vendor/lamejs, LGPL, loaded
// as a separate unmodified file).
importScripts('../vendor/lamejs/lame.min.js');

self.onmessage = (e) => {
  const { left, right, rate, kbps } = e.data;
  const encoder = new lamejs.Mp3Encoder(2, rate, kbps);
  const toInt16 = (f) => {
    const out = new Int16Array(f.length);
    for (let i = 0; i < f.length; i++) out[i] = Math.max(-32768, Math.min(32767, Math.round(f[i] * 32767)));
    return out;
  };
  const L = toInt16(left), R = toInt16(right);
  const parts = [];
  const block = 1152 * 20;
  for (let i = 0; i < L.length; i += block) {
    const chunk = encoder.encodeBuffer(L.subarray(i, i + block), R.subarray(i, i + block));
    if (chunk.length) parts.push(new Uint8Array(chunk));
    self.postMessage({ progress: Math.min(1, (i + block) / L.length) });
  }
  const end = encoder.flush();
  if (end.length) parts.push(new Uint8Array(end));
  self.postMessage({ blob: new Blob(parts, { type: 'audio/mpeg' }) });
};
