// Fish weights in kilograms (realistic for common, funny for rare)
const FISH_WEIGHTS = {
  minnow: 0.2,
  bluegill: 0.4,
  catfish: 1.2,
  pike: 2.5,
  salmon: 4.5,
  koi: 3.2,
  swordfish: 15,
  sturgeon: 30,
  golden_carp: 50,
  crystal_eel: 80,
  leviathan: 999,
  moby_dick: 999999,
  'moby-dick': 999999  // Handle both underscore and hyphen versions
};

function getFishWeight(fishId) {
  return FISH_WEIGHTS[fishId] || 0.1;
}

module.exports = { FISH_WEIGHTS, getFishWeight }; 