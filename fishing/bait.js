// Fishing bait logic
const BAIT_TYPES = [
  { id: 'basic', name: 'Basic Bait', emoji: '🪱', effect: { COMMON: 5 } },
  { id: 'shiny', name: 'Shiny Bait', emoji: '✨', effect: { RARE: 5, EPIC: 2 } },
  { id: 'golden', name: 'Golden Bait', emoji: '🥇', effect: { LEGENDARY: 3, MYTHIC: 1 } }
];

function getUserBait(user) {
  return user.bait || { id: 'basic', amount: 0 };
}

function useBait(user, baitId) {
  // This would update the user's bait usage in DB (not here)
  return BAIT_TYPES.find(b => b.id === baitId);
}

function listBaitTypes() {
  return BAIT_TYPES;
}

module.exports = { getUserBait, useBait, listBaitTypes }; 