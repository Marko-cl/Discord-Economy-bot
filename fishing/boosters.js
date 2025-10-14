// Fishing boosters logic
const BOOSTERS = [
  { id: 'luck', name: 'Lucky Charm', emoji: '🍀', effect: { luck: 0.05 }, duration: 1800 },
  { id: 'value', name: 'Value Booster', emoji: '💰', effect: { valueBoost: 0.2 }, duration: 1800 },
  { id: 'multi', name: 'Multi-Catch', emoji: '🎣', effect: { multiCatch: 2 }, duration: 900 }
];

function getUserFishingBoosters(user) {
  return user.fishingBoosters || [];
}

function useFishingBooster(user, boosterId) {
  // This would activate a booster in DB (not here)
  return BOOSTERS.find(b => b.id === boosterId);
}

function listFishingBoosters() {
  return BOOSTERS;
}

module.exports = { getUserFishingBoosters, useFishingBooster, listFishingBoosters }; 