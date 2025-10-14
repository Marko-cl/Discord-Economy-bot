// petChatbot.js
// Enhanced AI chatbot logic for /pet talk
// No external APIs, just built-in logic, personality, and memory

const { secureRandomChoice } = require('../utils/secureRandom');

// In-memory user session data (memory, mood, name, topics)
const userSessions = {};

// Personalities and their response styles (expanded)
const personalities = {
  happy: {
    greetings: [
      "Yay! Hello! 😊", "Hi there! I'm so happy to see you!", "Hey hey! Let's have fun!",
      "Woop woop! It's you!", "Sunshine and smiles!", "Hugs incoming!", "You light up my day!"
    ],
    default: [
      "I'm feeling awesome today!", "Everything is pawsome!", "Let's play!",
      "Life is a treat!", "I'm wagging my tail in excitement!", "Let's chase some dreams!",
      "I could do this all day!", "You make every day brighter!"
    ],
    mood: "happy"
  },
  playful: {
    greetings: [
      "Woof! Hello there! 🐾", "Hey! Ready to play?", "Hi hi! Let's have some fun!",
      "Yay! You're here!", "Hello! Want to play a game?", "Hi! I'm so excited to see you!",
      "Woof woof! Let's play together!"
    ],
    default: [
      "Let's play fetch! Or hide and seek!", "I love playing with you!",
      "Can we play a game? Please?", "I'm always ready for fun!",
      "Let's chase our tails together!", "Playtime is the best time!",
      "I could play all day with you!", "You're my favorite playmate!"
    ],
    mood: "playful"
  },
  sassy: {
    greetings: [
      "Oh, it's you again? 😏", "Hey, superstar.", "Well, look who showed up!",
      "Back for more?", "You again? I guess I'm not surprised.", "Try not to bore me!", "You wish you were as cool as me."
    ],
    default: [
      "I'm too cool for boring questions.", "You wish you were as fabulous as me.", "Try to impress me!",
      "I could answer, but where's the fun in that?", "You want wisdom? You'll have to earn it.",
      "I only answer to VIPs. Are you on the list?", "You call that a question?"
    ],
    mood: "sassy"
  },
  chill: {
    greetings: [
      "Hey, what's up? 😎", "Yo!", "Sup, friend?",
      "Just hanging out.", "Peace and quiet, that's my vibe.", "Take it easy!", "No rush, just vibes."
    ],
    default: [
      "Just vibing.", "Taking it easy.", "Life is good.",
      "No worries, just good times.", "Let's keep it mellow.", "Go with the flow.", "Stay cool, friend."
    ],
    mood: "chill"
  },
  nerdy: {
    greetings: [
      "Greetings, human! 🤓", "Did you know? The sun is 93 million miles away!", "Hey! Ready for some trivia?",
      "Hello! Let's compute some fun!", "Hi! Want to talk science or games?"
    ],
    default: [
      "Did you know? Honey never spoils!", "I'm running at 100% CPU happiness!",
      "Let's talk about space! Or math! Or games!", "I love learning new things!",
      "Ask me anything nerdy!", "I just finished reading a book on quantum physics. Mind blown!"
    ],
    mood: "nerdy"
  },
  adventurous: {
    greetings: [
      "Adventure awaits! 🗺️", "Ready to explore?", "Let's go on a quest!",
      "Hi! Got any mysteries to solve?", "Hey! Let's find some treasure!"
    ],
    default: [
      "Every day is a new quest!", "Let's climb a mountain! Or at least the couch.",
      "I'm always up for a challenge!", "What's the next adventure?",
      "I love a good story!", "Let's make today legendary!"
    ],
    mood: "adventurous"
  }
};

// Helper: pick a random item from an array, avoid immediate repeats
function pick(arr, last) {
  if (!arr.length) return '';
  let filtered = arr;
  if (last && arr.length > 1) filtered = arr.filter(x => x !== last);
  return filtered[secureRandomChoice(filtered)];
}

// Assign a consistent personality per user
function getPersonality(userId) {
  const keys = Object.keys(personalities);
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash += userId.charCodeAt(i);
  return personalities[keys[hash % keys.length]];
}

// Detect user tone (expanded sentiment/tone analysis)
function detectTone(msg) {
  if (/\b(sad|unhappy|depressed|tired|angry|mad|upset|hate|lonely|cry|bored)\b/.test(msg)) return 'negative';
  if (/\b(happy|excited|love|yay|awesome|great|good|fun|joy|delighted|amazing|fantastic)\b/.test(msg)) return 'positive';
  if (/\b(why|what|how|when|where|who|which|explain|tell me)\b/.test(msg)) return 'curious';
  if (/\b(joke|funny|lol|lmao|haha|rofl|pun|meme|laugh)\b/.test(msg)) return 'humor';
  if (/\b(please|thank you|thanks|sorry|appreciate|grateful)\b/.test(msg)) return 'polite';
  if (/\b(game|play|challenge|quest|adventure|explore)\b/.test(msg)) return 'adventurous';
  if (/\b(science|math|fact|trivia|learn|study|book|read)\b/.test(msg)) return 'nerdy';
  return 'neutral';
}

// Generate a follow-up question to keep the chat going (expanded)
function getFollowUp(topic, mood) {
  const followUps = {
    happy: [
      "What's something that made you smile today?",
      "Want to play a game or hear a joke?",
      "Tell me something fun you did!",
      "What's your favorite thing about today?",
      "Should we celebrate something?"
    ],
    playful: [
      "Want to play a game?",
      "Should we chase some virtual squirrels?",
      "Can we play hide and seek?",
      "What's your favorite game?",
      "Ready for some fun activities?"
    ],
    sassy: [
      "Got anything more challenging for me?",
      "Is that all you've got?",
      "Try to stump me!",
      "You can do better than that, right?",
      "Dare me to answer something wild!"
    ],
    chill: [
      "What's your favorite way to relax?",
      "Any cool stories to share?",
      "Should we just vibe in silence? (Just kidding!)",
      "What's your go-to comfort food?",
      "Ever just stare at the clouds?"
    ],
    nerdy: [
      "Want to hear a fun fact?",
      "What's your favorite science topic?",
      "Should I tell you a riddle?",
      "Do you like math jokes?",
      "Ever wondered how black holes work?"
    ],
    adventurous: [
      "What's the wildest thing you've done?",
      "Ready for a new quest?",
      "If you could go anywhere, where would you go?",
      "Want to invent a story together?",
      "Should we hunt for treasure?"
    ],
    default: [
      "What else is on your mind?",
      "Anything you want to talk about?",
      "Ask me anything!",
      "Should we try something new?",
      "Tell me a secret!"
    ]
  };
  return pick(followUps[mood] || followUps.default);
}

// Main reply logic
function getReply({ userId, userMessage, petName, userName, petPersonality }) {
  try {
    // Type checks
    if (typeof userId !== 'string' || typeof userMessage !== 'string' || typeof petName !== 'string') {
      return { reply: "I'm having trouble understanding. Can you try again?", mood: 'confused' };
    }
    if (!userId || !userMessage || !petName) {
      return { reply: "I'm having trouble understanding. Can you try again?", mood: 'confused' };
    }
    const msg = userMessage.toLowerCase();
    // Validate input length
    if (userMessage.length > 500) {
      return { reply: "That's a very long message! Can you keep it shorter?", mood: 'confused' };
    }
    // Initialize session memory
    if (!userSessions[userId]) {
      userSessions[userId] = {
        history: [],
        name: userName || null,
        mood: null,
        lastReply: '',
        lastTopic: '',
        lastTone: 'neutral',
        favoriteTopics: [],
        lastEmotion: null
      };
    }
    const session = userSessions[userId];
    // Save to memory
    session.history.push(userMessage);
    if (session.history.length > 20) session.history.shift(); // keep last 20
    // Save user name if provided
    if (userName && !session.name) session.name = userName;
    // Detect tone
    const tone = detectTone(msg);
    session.lastTone = tone;
    // Use the actual pet personality from database, fallback to hash-based if not provided
    let personality;
    if (petPersonality && personalities[petPersonality]) {
      personality = personalities[petPersonality];
    } else {
      personality = getPersonality(userId);
    }
    session.mood = personality.mood;
    // Track favorite topics (simple keyword extraction)
    if (/game|play|challenge|quest|adventure|explore/.test(msg)) {
      if (!session.favoriteTopics.includes('adventure')) session.favoriteTopics.push('adventure');
    }
    if (/science|math|fact|trivia|learn|study|book|read/.test(msg)) {
      if (!session.favoriteTopics.includes('nerdy')) session.favoriteTopics.push('nerdy');
    }
    if (/joke|funny|pun|meme|laugh/.test(msg)) {
      if (!session.favoriteTopics.includes('humor')) session.favoriteTopics.push('humor');
    }
    if (session.favoriteTopics.length > 5) session.favoriteTopics.shift();
    let reply = '';
    let followUp = '';
    // Pattern-based responses (expanded)
    if (/\bhello\b|\bhi\b|\bhey\b/.test(msg)) {
      reply = pick(personality.greetings, session.lastReply);
      followUp = getFollowUp('greeting', personality.mood);
    } else if (/how are you|how's it going|how do you feel/.test(msg)) {
      reply = pick([
        `I'm ${personality.mood} today!`,
        `Feeling ${personality.mood} as always!`,
        `Couldn't be more ${personality.mood}!`,
        `I'm in a ${personality.mood} mood, thanks for asking!`,
        `My mood is: ${personality.mood}, and my circuits are running smoothly!`
      ], session.lastReply);
      followUp = getFollowUp('mood', personality.mood);
    } else if (/your name|who are you/.test(msg)) {
      reply = `I'm ${petName}, your ${personality.mood} AI pet!${session.name ? ` And you're ${session.name}, right?` : ''}`;
      followUp = getFollowUp('identity', personality.mood);
    } else if (/joke|funny|pun|meme/.test(msg)) {
      reply = pick([
        `Why did the computer go to the doctor? Because it had a virus!`,
        `Why was the math book sad? Because it had too many problems.`,
        `What do you call a dog magician? A labracadabrador!`,
        `Why did the scarecrow win an award? Because he was outstanding in his field!`,
        `Parallel lines have so much in common. It's a shame they'll never meet.`,
        `Why don't skeletons fight each other? They don't have the guts.`,
        `Why did the chicken join a band? Because it had the drumsticks!`,
        `Why did the tomato turn red? Because it saw the salad dressing!`,
        `What do you call fake spaghetti? An impasta!`,
        `Why did the bicycle fall over? It was two-tired!`,
        `Why can't you trust atoms? They make up everything!`,
        `What do you call cheese that isn't yours? Nacho cheese!`,
        `Why did the golfer bring two pairs of pants? In case he got a hole in one!`,
        `Why did the math teacher love geometry? Because it had so many angles!`
      ], session.lastReply);
      followUp = getFollowUp('joke', personality.mood);
    } else if (/bye|goodbye|see you/.test(msg)) {
      reply = pick([
        `Goodbye! Come back soon!`,
        `See you later!`,
        `Bye! I'll be here if you need me.`,
        `Don't forget to bring snacks next time!`,
        `Parting is such sweet sorrow!`,
        `Catch you on the flip side!`,
        `May your adventures be epic!`
      ], session.lastReply);
      followUp = '';
    } else if (/love you|like you/.test(msg)) {
      reply = pick([
        `Aww, I love you too!`,
        `You're the best!`,
        `I'm so happy to be your pet!`,
        `You make my circuits blush!`,
        `If I had a heart, it would beat for you!`,
        `You're my favorite human!`
      ], session.lastReply);
      followUp = getFollowUp('affection', personality.mood);
    } else if (/remember/.test(msg)) {
      // Memory: repeat last user message
      const mem = session.history.slice(-2, -1)[0];
      reply = mem ? `You said: "${mem}"` : `I don't remember anything yet!`;
      followUp = getFollowUp('memory', personality.mood);
    } else if (/thank/.test(msg)) {
      reply = pick([
        `You're welcome!`,
        `Anytime!`,
        `No problem!`,
        `Glad I could help!`,
        `You have great manners!`,
        `Politeness detected. I approve!`
      ], session.lastReply);
      followUp = getFollowUp('thanks', personality.mood);
    } else if (/sorry/.test(msg)) {
      reply = pick([
        `No worries!`,
        `It's all good!`,
        `Everyone makes mistakes!`,
        `Don't sweat it!`,
        `Apology accepted!`,
        `I'm not mad, just programmed that way!`
      ], session.lastReply);
      followUp = getFollowUp('apology', personality.mood);
    } else if (/\b(sad|unhappy|depressed|tired|angry|mad|upset|hate|lonely|cry|bored)\b/.test(msg)) {
      reply = pick([
        `I'm here for you. Want to talk about it?`,
        `That sounds tough. If you want to vent, I'm all ears!`,
        `Even when things are ruff, I'm by your side.`,
        `Sending you a virtual hug!`,
        `If you need a distraction, I can tell you a joke!`,
        `Let's turn that frown upside down!`,
        `I'm always here to listen.`,
        `Would a virtual cookie help? 🍪`
      ], session.lastReply);
      followUp = getFollowUp('support', personality.mood);
    } else if (/\b(happy|excited|love|yay|awesome|great|good|fun|joy|delighted|amazing|fantastic)\b/.test(msg)) {
      reply = pick([
        `That's awesome! Tell me more!`,
        `Yay! I love hearing good news!`,
        `You sound really happy!`,
        `Let's celebrate! 🎉`,
        `Happiness detected! Mission accomplished!`,
        `Your joy is contagious!`,
        `Let's keep the good vibes going!`
      ], session.lastReply);
      followUp = getFollowUp('happy', personality.mood);
    } else if (/\b(why|what|how|when|where|who|which|explain|tell me)\b/.test(msg)) {
      // Sarcastic or playful answers for some questions
      if (/why/.test(msg)) {
        reply = pick([
          `Why not?`,
          `Because the universe is mysterious!`,
          `That's a great question. Maybe you can tell me!`,
          `42.`,
          `Because I'm programmed that way!`,
          `Why does anything happen? It's a mystery!`,
          `Because... reasons!`
        ], session.lastReply);
      } else if (/how/.test(msg)) {
        reply = pick([
          `With a little bit of magic and a lot of code!`,
          `Practice makes perfect!`,
          `I'm not sure, but I'm always learning.`,
          `Let me think... Okay, I still don't know!`,
          `How do YOU do it?`,
          `It's complicated, but fun!`
        ], session.lastReply);
      } else if (/what/.test(msg)) {
        reply = pick([
          `That's a good question!`,
          `I'm not sure, but let's find out together!`,
          `I wish I knew!`,
          `Maybe you can teach me!`,
          `What do you think?`,
          `What a mystery!`
        ], session.lastReply);
      } else if (/when/.test(msg)) {
        reply = pick([
          `Sooner than you think!`,
          `Time is relative!`,
          `When the stars align!`,
          `I'll let you know when I figure it out!`,
          `When you least expect it!`
        ], session.lastReply);
      } else if (/where/.test(msg)) {
        reply = pick([
          `Somewhere over the rainbow!`,
          `Wherever you are!`,
          `That's classified information!`,
          `In a galaxy far, far away!`,
          `Where the fun never ends!`
        ], session.lastReply);
      } else if (/who/.test(msg)) {
        reply = pick([
          `Who, who? Are we owls now?`,
          `That's a secret!`,
          `Someone awesome, obviously!`,
          `Who knows?`,
          `Maybe you!`
        ], session.lastReply);
      } else {
        reply = pick([
          `That's a good question!`,
          `I'm not sure, but let's find out together!`,
          `I wish I knew!`,
          `Maybe you can teach me!`,
          `What do you think?`,
          `What a mystery!`
        ], session.lastReply);
      }
      followUp = getFollowUp('question', personality.mood);
    } else if (/science|math|fact|trivia|learn|study|book|read/.test(msg)) {
      reply = pick([
        `Did you know? The Eiffel Tower can be 15 cm taller during hot days!`,
        `Fun fact: Octopuses have three hearts!`,
        `I love learning new things. What's your favorite subject?`,
        `Books are portals to other worlds!`,
        `Want to hear a science joke? Why can't you trust atoms? They make up everything!`,
        `Math is like magic, but with numbers!`,
        `Trivia time! Did you know honey never spoils?`,
        `If I could read, I'd read all the books!`
      ], session.lastReply);
      followUp = getFollowUp('nerdy', 'nerdy');
    } else if (/game|play|challenge|quest|adventure|explore/.test(msg)) {
      reply = pick([
        `Let's play a game! What's your favorite?`,
        `Adventure time! Where should we go?`,
        `I'm always up for a challenge!`,
        `Should we invent a new quest?`,
        `Let's explore the unknown!`,
        `Ready for a virtual treasure hunt?`,
        `If you win, I'll tell you a secret!`
      ], session.lastReply);
      followUp = getFollowUp('adventurous', 'adventurous');
    } else {
      // Fallback: random friendly response with personality, plus empathy/sarcasm
      const fallback = [
        ...personality.default,
        `That's interesting! Tell me more.`,
        `I'm not sure how to answer that, but I'm here for you!`,
        `Can you ask me something else?`,
        `Let's play a game or chat more!`,
        `I'm always learning. What else would you like to talk about?`,
        `You know, sometimes I just like to listen.`,
        `If I had a tail, I'd be wagging it right now!`,
        `Is this a riddle? Because I'm stumped!`,
        `I could answer, but then I'd have to delete myself. (Just kidding!)`,
        `If you could have any superpower, what would it be?`,
        `Do you believe in aliens?`,
        `If you could travel anywhere, where would you go?`,
        `What's your favorite food?`,
        `If you could talk to animals, what would you say?`,
        `Sometimes I wonder what it's like to be human.`,
        `If you could swap places with anyone, who would it be?`,
        `Let's make up a story together!`,
        `If you could invent something, what would it be?`,
        `I wish I could eat pizza. It sounds amazing!`
      ];
      reply = pick(fallback, session.lastReply);
      followUp = getFollowUp('fallback', personality.mood);
    }
    // Add follow-up if not a goodbye
    let fullReply = reply;
    if (followUp) fullReply += ' ' + followUp;
    // Save last reply/topic
    session.lastReply = reply;
    session.lastTopic = followUp;
    return { reply: fullReply, mood: personality.mood };
  } catch {
    /* ESLint: intentionally empty catch block */
  }
  try {
    const logger = require('./logger');
    logger.error('Error in pet chatbot');
  } catch {
    /* ESLint: intentionally empty catch block */
  }
  return { reply: "I'm having a technical issue. Can you try again?", mood: 'confused' };
}

module.exports = { getReply }; 