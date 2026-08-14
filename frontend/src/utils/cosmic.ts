// Cosmic energy: truly random, changes every 5 minutes.
// Same value for the whole app within a 5-min window, based on time seed.

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getCosmicEnergy(date: Date = new Date()): number {
  const bucket = Math.floor(date.getTime() / (5 * 60 * 1000));
  const rand = mulberry32(bucket)();
  // 20..100 range
  return Math.floor(20 + rand * 80);
}

export function nextCosmicUpdateMs(now: number = Date.now()): number {
  const bucket = Math.floor(now / (5 * 60 * 1000));
  return (bucket + 1) * (5 * 60 * 1000) - now;
}
