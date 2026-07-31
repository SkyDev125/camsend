export const xorshift32 = (seed) => {
  let value = seed >>> 0;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0);
  };
};

export const repairIndices = (session, sequence, sourceCount) => {
  if (sourceCount <= 0) return [];
  const seed = ((session ^ Math.imul(sequence, 0x9e3779b1) ^ 0xa5a5a5a5) >>> 0) || 1;
  const random = xorshift32(seed);
  const roll = random() % 100;
  const degree = sourceCount === 1 ? 1 : roll < 55 ? 1 : roll < 82 ? 2 : roll < 94 ? 3 : Math.min(sourceCount, 4 + (random() % 4));
  const chosen = new Set();
  while (chosen.size < degree) chosen.add(random() % sourceCount);
  return [...chosen].sort((a, b) => a - b);
};
