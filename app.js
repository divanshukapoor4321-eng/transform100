/* ===========================================================
   Transform100 — app.js  (v2)
   Everything runs in your browser and saves to localStorage.
   Sections below: storage, formulas, plan generators (diet,
   cardio, weights), navigation, auth, profile, rendering,
   and the trackers (meal log, water, workout streak).
   =========================================================== */

/* -----------------------------------------------------------
   0. SMALL HELPERS
----------------------------------------------------------- */
const todayStr = () => new Date().toISOString().slice(0, 10);
// Shift a 'YYYY-MM-DD' string by n days (n can be negative).
function shiftDate(str, n) {
  const d = new Date(str + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

const SLOGANS = [
  'The body achieves what the mind believes.',
  'Push yourself — no one else will do it for you.',
  'Discipline beats motivation. Show up anyway.',
  'Small steps every day add up to big results.',
  'Sweat now, shine later. 💦',
  'Your only competition is who you were yesterday.',
  'Sore today, strong tomorrow.',
  "Don't wish for it — work for it.",
];
const randomSlogan = () => SLOGANS[Math.floor(Math.random() * SLOGANS.length)];

/* -----------------------------------------------------------
   1. STORAGE
   NOTE: passwords are stored in plain text — fine for a local
   learning app, NOT secure for a real public site.
----------------------------------------------------------- */
const DB = {
  users() { return JSON.parse(localStorage.getItem('t100_users') || '{}'); },
  saveUsers(u) { localStorage.setItem('t100_users', JSON.stringify(u)); },
  session() { return localStorage.getItem('t100_session'); },
  setSession(n) { localStorage.setItem('t100_session', n); },
  clearSession() { localStorage.removeItem('t100_session'); },
  current() {
    const n = this.session();
    if (!n) return null;
    const u = this.users()[n];
    return u ? normalizeUser(u) : null;
  },
  saveCurrent(u) { const users = this.users(); users[this.session()] = u; this.saveUsers(users); }
};

// Make sure older accounts gain the new fields without breaking.
function normalizeUser(u) {
  u.progress = u.progress || [];       // weight log
  u.meals = u.meals || {};             // { date: [ {name, kcal} ] }
  u.water = u.water || {};             // { date: glasses }
  u.workoutsDone = u.workoutsDone || {}; // { date: true }
  u.foodPicker = u.foodPicker || [];     // ids of foods chosen in the "eat today" picker
  return u;
}

/* -----------------------------------------------------------
   2. FITNESS FORMULAS
----------------------------------------------------------- */
function calcBMR({ sex, weight, height, age }) {
  const base = 10 * weight + 6.25 * height - 5 * age;
  return Math.round(sex === 'male' ? base + 5 : base - 161);
}
function calcTDEE(bmr, activity) { return Math.round(bmr * Number(activity)); }
function calcCalorieTarget(tdee, goal) {
  if (goal === 'lose') return tdee - 500;
  if (goal === 'gain') return tdee + 300;
  return tdee;
}
function calcMacros(calories, weight, goal) {
  const protein = Math.round(weight * (goal === 'lose' ? 2.2 : 2.0));
  const fat = Math.round((calories * 0.25) / 9);
  const carbs = Math.round((calories - (protein * 4 + fat * 9)) / 4);
  return { protein, carbs: Math.max(carbs, 0), fat };
}
function buildTargets(p) {
  const bmr = calcBMR(p);
  const tdee = calcTDEE(bmr, p.activity);
  const calories = calcCalorieTarget(tdee, p.goal);
  return { bmr, tdee, calories, macros: calcMacros(calories, p.weight, p.goal) };
}

/* -----------------------------------------------------------
   3. DIET PLAN
----------------------------------------------------------- */
/* Each meal slot: which key, share of daily calories, and a default time. */
const MEAL_SPLIT = [
  { name: 'Breakfast', key: 'breakfast', pct: 0.25, time: '8:00 AM' },
  { name: 'Lunch',     key: 'lunch',     pct: 0.30, time: '1:00 PM' },
  { name: 'Snack',     key: 'snack',     pct: 0.15, time: '5:00 PM' },
  { name: 'Dinner',    key: 'dinner',    pct: 0.30, time: '8:00 PM' },
];

/* Indian dish database. `type`: vegan | veg (has dairy) | nonveg (egg/meat).
   One item per dish may be the "staple" (roti/rice/etc.) — its count is scaled
   to match your calorie target. `each` = kcal/protein per unit of the staple. */
const INDIAN_MEALS = {
  breakfast: [
    { name: 'Vegetable Poha', type: 'vegan',
      items: [
        { staple: true, unit: 'katori', base: 1.5, step: 0.5, min: 1, max: 3, each: { kcal: 120, protein: 2.5 } },
        { label: 'Peanuts + onion, peas & curry leaves', kcal: 70, protein: 3 },
      ],
      recipe: ['Rinse 1 cup flattened rice (poha) and drain.', 'Temper mustard seeds, curry leaves, chopped onion, green chilli & peanuts in 1 tsp oil.', 'Add peas, turmeric & salt, then the poha; toss 2–3 min.', 'Finish with lemon juice and coriander.'] },
    { name: 'Besan Chilla', type: 'vegan',
      items: [
        { staple: true, unit: 'chilla', base: 2, step: 1, min: 1, max: 4, each: { kcal: 140, protein: 7 } },
        { label: 'Mint–coriander chutney', kcal: 20, protein: 1 },
      ],
      recipe: ['Whisk 1 cup gram flour (besan) with water to a pourable batter.', 'Mix in chopped onion, tomato, green chilli, turmeric & salt.', 'Pour a ladle on a hot non-stick tava, spread thin, cook both sides with a few drops of oil.', 'Serve hot with chutney.'] },
    { name: 'Oats Vegetable Upma', type: 'vegan',
      items: [
        { staple: true, unit: 'katori', base: 1.5, step: 0.5, min: 1, max: 3, each: { kcal: 130, protein: 4 } },
        { label: 'Mixed veggies (carrot, beans, peas)', kcal: 40, protein: 2 },
      ],
      recipe: ['Dry-roast 1 cup oats for 2 min and set aside.', 'Temper mustard seeds, urad dal, curry leaves & onion in 1 tsp oil.', 'Add chopped veggies and sauté; pour 1.5 cups water and boil.', 'Stir in the oats, cook 3–4 min until thick.'] },
    { name: 'Idli with Sambar', type: 'vegan',
      items: [
        { staple: true, unit: 'idli', base: 3, step: 1, min: 2, max: 6, each: { kcal: 60, protein: 2 } },
        { label: '1 katori sambar', kcal: 120, protein: 6 },
      ],
      recipe: ['Steam idli batter in a greased mould for ~10 min until spongy.', 'For quick sambar: cook toor dal with veggies, tamarind & sambar powder.', 'Temper with mustard, curry leaves & hing, then mix in.', 'Serve idlis hot with sambar.'] },
    { name: 'Aloo Paratha with Curd', type: 'veg',
      items: [
        { staple: true, unit: 'paratha', base: 2, step: 1, min: 1, max: 3, each: { kcal: 170, protein: 4 } },
        { label: '1 katori curd (100g)', kcal: 60, protein: 3.5 },
      ],
      recipe: ['Knead whole-wheat dough; rest 10 min.', 'Stuff with mashed spiced potato, roll gently.', 'Cook on a tava with ½ tsp oil/ghee each side until golden.', 'Serve with curd.'] },
    { name: 'Egg Bhurji with Toast', type: 'nonveg',
      items: [
        { staple: true, unit: 'egg', base: 2, step: 1, min: 2, max: 4, each: { kcal: 75, protein: 6 } },
        { label: '2 multigrain toast', kcal: 140, protein: 5 },
      ],
      recipe: ['Sauté onion, tomato, green chilli in 1 tsp oil.', 'Add turmeric, salt & a pinch of garam masala.', 'Pour beaten eggs and scramble to your liking.', 'Serve with toast.'] },
  ],
  lunch: [
    { name: 'Roti, Dal, Bhindi & Curd', type: 'veg',
      items: [
        { staple: true, unit: 'roti', base: 3, step: 1, min: 2, max: 6, each: { kcal: 75, protein: 2.5 } },
        { label: '1 katori toor dal (150g)', kcal: 140, protein: 8 },
        { label: '1 katori bhindi sabzi', kcal: 110, protein: 3 },
        { label: '1 small bowl curd + salad', kcal: 90, protein: 4.5 },
      ],
      recipe: ['Pressure-cook toor dal, temper with cumin, garlic & tomato.', 'Sauté chopped okra (bhindi) with onion & spices until tender.', 'Roast fresh rotis on a tava.', 'Plate with curd and a fresh salad.'] },
    { name: 'Rajma Chawal with Salad', type: 'vegan',
      items: [
        { staple: true, unit: 'katori', base: 1.5, step: 0.5, min: 1, max: 3, each: { kcal: 180, protein: 4 } },
        { label: '1 katori rajma curry (150g)', kcal: 180, protein: 9 },
        { label: 'Onion–cucumber salad', kcal: 30, protein: 1 },
      ],
      recipe: ['Soak rajma overnight; pressure-cook until soft.', 'Make a base of onion, tomato, ginger-garlic & spices.', 'Add rajma + a little cooking water; simmer 10 min.', 'Serve over steamed rice with salad.'] },
    { name: 'Roti, Paneer Bhurji & Dal', type: 'veg',
      items: [
        { staple: true, unit: 'roti', base: 3, step: 1, min: 2, max: 6, each: { kcal: 75, protein: 2.5 } },
        { label: '1 katori paneer bhurji (60g paneer)', kcal: 170, protein: 11 },
        { label: '1 katori moong dal', kcal: 130, protein: 8 },
      ],
      recipe: ['Crumble paneer; sauté with onion, tomato, capsicum & spices.', 'Cook moong dal and temper with cumin & garlic.', 'Make fresh rotis.', 'Serve together hot.'] },
    { name: 'Chole with Jeera Rice', type: 'vegan',
      items: [
        { staple: true, unit: 'katori', base: 1.5, step: 0.5, min: 1, max: 3, each: { kcal: 180, protein: 4 } },
        { label: '1 katori chole (150g)', kcal: 180, protein: 9 },
        { label: 'Onion–lemon salad', kcal: 30, protein: 1 },
      ],
      recipe: ['Pressure-cook soaked chickpeas until soft.', 'Cook onion-tomato masala with chole spices; add chickpeas, simmer.', 'Temper rice with cumin in 1 tsp oil.', 'Serve chole over jeera rice with salad.'] },
    { name: 'Chicken Curry with Rice', type: 'nonveg',
      items: [
        { staple: true, unit: 'katori', base: 1.5, step: 0.5, min: 1, max: 3, each: { kcal: 180, protein: 4 } },
        { label: '1 katori chicken curry (120g)', kcal: 220, protein: 26 },
        { label: 'Salad', kcal: 30, protein: 1 },
      ],
      recipe: ['Marinate chicken in curd, ginger-garlic & spices for 20 min.', 'Sauté onion-tomato masala; add chicken and brown.', 'Add water, cover and simmer until cooked.', 'Serve with steamed rice and salad.'] },
  ],
  dinner: [
    { name: 'Roti, Mixed Veg & Moong Dal', type: 'vegan',
      items: [
        { staple: true, unit: 'roti', base: 2, step: 1, min: 1, max: 5, each: { kcal: 75, protein: 2.5 } },
        { label: '1 katori mixed veg sabzi', kcal: 110, protein: 3 },
        { label: '1 katori moong dal', kcal: 130, protein: 8 },
      ],
      recipe: ['Cook moong dal; temper with cumin, garlic & tomato.', 'Stir-fry mixed vegetables with light spices.', 'Roast fresh rotis.', 'Serve warm with a little salad.'] },
    { name: 'Vegetable Khichdi with Curd', type: 'veg',
      items: [
        { staple: true, unit: 'katori', base: 2, step: 0.5, min: 1, max: 3, each: { kcal: 170, protein: 6 } },
        { label: '1 bowl curd + roasted papad', kcal: 95, protein: 5 },
      ],
      recipe: ['Wash rice + moong dal (1:1) and chopped veggies.', 'Pressure-cook with turmeric, salt & water (1:3) for 3 whistles.', 'Temper with cumin & ghee.', 'Serve hot with curd and papad.'] },
    { name: 'Roti with Palak Paneer', type: 'veg',
      items: [
        { staple: true, unit: 'roti', base: 2, step: 1, min: 1, max: 5, each: { kcal: 75, protein: 2.5 } },
        { label: '1 katori palak paneer (60g paneer)', kcal: 200, protein: 12 },
        { label: 'Salad', kcal: 30, protein: 1 },
      ],
      recipe: ['Blanch and purée spinach.', 'Sauté onion, tomato, ginger-garlic; add the purée & spices.', 'Fold in paneer cubes; simmer 5 min.', 'Serve with fresh rotis.'] },
    { name: 'Tofu Bhurji with Roti', type: 'vegan',
      items: [
        { staple: true, unit: 'roti', base: 2, step: 1, min: 1, max: 5, each: { kcal: 75, protein: 2.5 } },
        { label: '1 katori tofu bhurji (100g tofu)', kcal: 150, protein: 12 },
        { label: 'Salad', kcal: 30, protein: 1 },
      ],
      recipe: ['Crumble firm tofu.', 'Sauté onion, tomato, capsicum & turmeric in 1 tsp oil.', 'Add tofu, salt & garam masala; cook 5 min.', 'Serve with rotis and salad.'] },
    { name: 'Grilled Chicken with Veg & Roti', type: 'nonveg',
      items: [
        { staple: true, unit: 'roti', base: 2, step: 1, min: 1, max: 5, each: { kcal: 75, protein: 2.5 } },
        { label: 'Grilled chicken (120g)', kcal: 200, protein: 30 },
        { label: 'Sautéed vegetables', kcal: 80, protein: 3 },
      ],
      recipe: ['Marinate chicken in curd, lemon, ginger-garlic & spices.', 'Grill or pan-sear until cooked through.', 'Toss seasonal veggies in 1 tsp olive oil.', 'Serve with 1–2 rotis.'] },
  ],
  snack: [
    { name: 'Sprouts Chaat', type: 'vegan',
      items: [{ label: '1 katori moong sprouts chaat (150g)', kcal: 150, protein: 9 }],
      recipe: ['Steam or boil moong sprouts for 3–4 min.', 'Toss with chopped onion, tomato, cucumber & coriander.', 'Add lemon, chaat masala & a pinch of salt.'] },
    { name: 'Roasted Chana with Fruit', type: 'vegan',
      items: [{ label: '30g roasted chana', kcal: 120, protein: 6 }, { label: '1 apple or orange', kcal: 70, protein: 1 }],
      recipe: ['Keep a handful of roasted chana ready.', 'Pair with a seasonal fruit for fibre & vitamins.'] },
    { name: 'Curd with Nuts', type: 'veg',
      items: [{ label: '1 bowl curd (150g)', kcal: 90, protein: 5 }, { label: '8–10 almonds', kcal: 70, protein: 3 }],
      recipe: ['Take a bowl of plain curd.', 'Top with a few almonds (and seeds if you like).'] },
    { name: 'Banana & Peanut Butter', type: 'vegan',
      items: [{ label: '1 banana', kcal: 100, protein: 1.3 }, { label: '1 tbsp peanut butter', kcal: 95, protein: 4 }],
      recipe: ['Slice a banana.', 'Spread or dip with 1 tbsp natural peanut butter.'] },
    { name: 'Masala Buttermilk & Makhana', type: 'veg',
      items: [{ label: '1 glass masala buttermilk', kcal: 40, protein: 2 }, { label: '30g roasted makhana', kcal: 100, protein: 3 }],
      recipe: ['Whisk curd with water, roasted cumin, salt & coriander.', 'Dry-roast makhana (fox nuts) in 1 tsp ghee until crisp.'] },
  ],
};

function dishAllowed(d, diet) {
  if (diet === 'vegan') return d.type === 'vegan';
  if (diet === 'vegetarian') return d.type === 'vegan' || d.type === 'veg';
  return true; // 'none' = no restriction (includes egg/meat)
}
const formatCount = c => (Number.isInteger(c) ? String(c) : c.toFixed(1));
function pluralUnit(unit, count) {
  if (count === 1) return unit;
  if (unit === 'katori') return 'katori';
  if (unit === 'glass') return 'glasses';
  return unit + 's';
}

// Build a day's Indian plan, scaling each meal's staple to its calorie target.
function buildIndianPlan(targets, diet, offset) {
  const daySeed = new Date().getDate();
  return MEAL_SPLIT.map((slot, si) => {
    const list = (INDIAN_MEALS[slot.key] || []).filter(d => dishAllowed(d, diet));
    if (!list.length) return null;
    const idx = (((daySeed + si * 7 + offset) % list.length) + list.length) % list.length;
    const dish = list[idx];
    const slotTarget = Math.round(targets.calories * slot.pct);

    const items = []; let kcal = 0, protein = 0, fixedKcal = 0, fixedProt = 0, staple = null;
    dish.items.forEach(it => {
      if (it.staple) staple = it;
      else { fixedKcal += it.kcal; fixedProt += it.protein || 0; items.push({ label: it.label, kcal: it.kcal }); }
    });
    if (staple) {
      let count = Math.round(((slotTarget - fixedKcal) / staple.each.kcal) / staple.step) * staple.step;
      count = Math.min(Math.max(count, staple.min), staple.max);
      const sk = Math.round(count * staple.each.kcal);
      items.unshift({ label: `${formatCount(count)} ${pluralUnit(staple.unit, count)}`, kcal: sk });
      kcal = fixedKcal + sk; protein = Math.round(fixedProt + count * staple.each.protein);
    } else { kcal = fixedKcal; protein = Math.round(fixedProt); }

    return { meal: slot.name, time: slot.time, name: dish.name, type: dish.type, items, kcal, protein, recipe: dish.recipe };
  }).filter(Boolean);
}

/* -----------------------------------------------------------
   4. CARDIO PLAN  (new — tailored to the goal)
----------------------------------------------------------- */
function buildCardioPlan(goal) {
  const plans = {
    lose: {
      intro: 'Cardio is your fat-loss accelerator. Aim for 4–5 sessions per week.',
      sessions: [
        { title: 'Steady-state (×3/week)', detail: '30–40 min brisk walk, jog, cycle or elliptical at a pace where you can still talk.' },
        { title: 'HIIT (×1–2/week)', detail: '15–20 min: 30s hard effort / 60s easy, repeated 8–10 times. Great for burning calories fast.' },
      ],
    },
    maintain: {
      intro: 'Keep your heart healthy with 2–3 sessions per week.',
      sessions: [
        { title: 'Steady-state (×2/week)', detail: '25–30 min moderate cardio of your choice.' },
        { title: 'Optional HIIT (×1/week)', detail: '15 min intervals if you want an extra challenge.' },
      ],
    },
    gain: {
      intro: 'Keep cardio light so it doesn’t eat into muscle gains — 1–2 short sessions per week.',
      sessions: [
        { title: 'Low-intensity (×1–2/week)', detail: '20 min easy walk or cycle. Supports recovery and heart health without burning too many calories.' },
      ],
    },
  };
  return plans[goal] || plans.maintain;
}
const CARDIO_OPTIONS = ['🚶 Brisk walking', '🏃 Jogging / running', '🚴 Cycling', '🪢 Jump rope',
  '🚣 Rowing machine', '🪜 Stair climber', '🏊 Swimming', '🥊 Shadow boxing'];

/* -----------------------------------------------------------
   5. WEIGHT TRAINING PLAN
----------------------------------------------------------- */
function repScheme(goal) {
  if (goal === 'gain') return '4 × 8–12';
  if (goal === 'lose') return '3 × 12–15';
  return '4 × 8–10';
}
const EXERCISES = {
  gym: {
    push: ['Barbell bench press', 'Overhead press', 'Incline dumbbell press', 'Triceps pushdown'],
    pull: ['Lat pulldown', 'Barbell row', 'Seated cable row', 'Biceps curl'],
    legs: ['Barbell squat', 'Romanian deadlift', 'Leg press', 'Leg curl', 'Calf raise'],
    upper: ['Bench press', 'Barbell row', 'Overhead press', 'Lat pulldown', 'Biceps curl'],
    lower: ['Barbell squat', 'Romanian deadlift', 'Leg press', 'Leg curl', 'Calf raise'],
    full: ['Barbell squat', 'Bench press', 'Barbell row', 'Overhead press', 'Plank'],
  },
  home: {
    push: ['Dumbbell bench press', 'Dumbbell shoulder press', 'Push-ups', 'Overhead triceps extension'],
    pull: ['One-arm dumbbell row', 'Resistance-band pulldown', 'Band face pull', 'Dumbbell curl'],
    legs: ['Goblet squat', 'Dumbbell Romanian deadlift', 'Walking lunges', 'Calf raise'],
    upper: ['Dumbbell bench press', 'One-arm row', 'Dumbbell shoulder press', 'Dumbbell curl'],
    lower: ['Goblet squat', 'Dumbbell RDL', 'Walking lunges', 'Calf raise'],
    full: ['Goblet squat', 'Push-ups', 'One-arm row', 'Dumbbell shoulder press', 'Plank'],
  },
  bodyweight: {
    push: ['Push-ups', 'Pike push-ups', 'Chair dips', 'Diamond push-ups'],
    pull: ['Inverted rows (under a table)', 'Doorway rows', 'Superman holds', 'Towel curls'],
    legs: ['Bodyweight squats', 'Reverse lunges', 'Glute bridges', 'Calf raises'],
    upper: ['Push-ups', 'Inverted rows', 'Pike push-ups', 'Chair dips'],
    lower: ['Bodyweight squats', 'Reverse lunges', 'Glute bridges', 'Calf raises'],
    full: ['Bodyweight squats', 'Push-ups', 'Inverted rows', 'Plank', 'Glute bridges'],
  },
};
function chooseSplit(days) {
  if (days <= 3) return ['full', 'full', 'full'];
  if (days === 4) return ['upper', 'lower', 'upper', 'lower'];
  if (days === 5) return ['push', 'pull', 'legs', 'upper', 'lower'];
  return ['push', 'pull', 'legs', 'push', 'pull', 'legs'];
}
function buildWorkoutPlan(profile) {
  const split = chooseSplit(Number(profile.trainingDays));
  const lib = EXERCISES[profile.equipment];
  const scheme = repScheme(profile.goal);
  const labels = { push: 'Push', pull: 'Pull', legs: 'Legs', upper: 'Upper body', lower: 'Lower body', full: 'Full body' };
  return split.map((group, i) => ({
    title: `Day ${i + 1} — ${labels[group]}`,
    exercises: lib[group].map(name => ({ name, scheme })),
  }));
}

/* -----------------------------------------------------------
   6. NAVIGATION (side menu)
----------------------------------------------------------- */
const views = {
  dashboard: document.getElementById('dashboardView'),
  diet: document.getElementById('dietView'),
  cardio: document.getElementById('cardioView'),
  weights: document.getElementById('weightsView'),
  water: document.getElementById('waterView'),
  progress: document.getElementById('progressView'),
  profile: document.getElementById('profileView'),
};
function showView(name) {
  Object.values(views).forEach(v => v.classList.add('hidden'));
  views[name].classList.remove('hidden');
  document.querySelectorAll('.side-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
document.querySelectorAll('.side-btn').forEach(btn =>
  btn.addEventListener('click', () => {
    if (btn.dataset.view === 'profile') { fillProfileForm(); populateAISettings(); }
    showView(btn.dataset.view);
  })
);

/* -----------------------------------------------------------
   7. AUTH
----------------------------------------------------------- */
let authMode = 'login';
const authError = document.getElementById('authError');
document.getElementById('loginTab').addEventListener('click', () => setAuthMode('login'));
document.getElementById('signupTab').addEventListener('click', () => setAuthMode('signup'));
function setAuthMode(mode) {
  authMode = mode;
  document.getElementById('loginTab').classList.toggle('active', mode === 'login');
  document.getElementById('signupTab').classList.toggle('active', mode === 'signup');
  document.getElementById('authSubmit').textContent = mode === 'login' ? 'Log in' : 'Create account';
  authError.classList.add('hidden');
}
document.getElementById('authForm').addEventListener('submit', e => {
  e.preventDefault();
  const name = document.getElementById('authUsername').value.trim().toLowerCase();
  const pass = document.getElementById('authPassword').value;
  const users = DB.users();
  if (!name || !pass) return showAuthError('Please fill in both fields.');
  if (authMode === 'signup') {
    if (users[name]) return showAuthError('That username is already taken.');
    users[name] = { password: pass, profile: null, progress: [], meals: {}, water: {}, workoutsDone: {} };
    DB.saveUsers(users); DB.setSession(name); enterApp();
  } else {
    if (!users[name]) return showAuthError('No account with that username.');
    if (users[name].password !== pass) return showAuthError('Incorrect password.');
    DB.setSession(name); enterApp();
  }
});
function showAuthError(msg) { authError.textContent = msg; authError.classList.remove('hidden'); }

document.getElementById('logoutBtn').addEventListener('click', () => {
  DB.clearSession();
  document.getElementById('appShell').classList.add('hidden');
  document.getElementById('authScreen').classList.remove('hidden');
  document.getElementById('authForm').reset();
});

/* -----------------------------------------------------------
   8. PROFILE
----------------------------------------------------------- */
const profileForm = document.getElementById('profileForm');
function fillProfileForm() {
  const u = DB.current();
  if (!u || !u.profile) return;
  const p = u.profile;
  age.value = p.age; sex.value = p.sex; height.value = p.height; weight.value = p.weight;
  goalWeight.value = p.goalWeight; goal.value = p.goal; activity.value = p.activity;
  trainingDays.value = p.trainingDays; equipment.value = p.equipment;
  document.getElementById('diet').value = p.diet;
}
profileForm.addEventListener('submit', e => {
  e.preventDefault();
  const u = DB.current();
  u.profile = {
    age: Number(age.value), sex: sex.value, height: Number(height.value), weight: Number(weight.value),
    goalWeight: Number(goalWeight.value), goal: goal.value, activity: activity.value,
    trainingDays: trainingDays.value, equipment: equipment.value,
    diet: document.getElementById('diet').value,
  };
  DB.saveCurrent(u);
  renderAll();
  showView('dashboard');
});

/* -----------------------------------------------------------
   9. RENDER EVERYTHING
----------------------------------------------------------- */
function renderAll() {
  const u = DB.current();
  if (!u || !u.profile) return;
  const p = u.profile;
  const targets = buildTargets(p);

  /* ---- Dashboard ---- */
  document.getElementById('dashName').textContent = DB.session();
  const toGo = (p.weight - p.goalWeight).toFixed(1);
  const dir = p.weight > p.goalWeight ? 'to lose' : p.weight < p.goalWeight ? 'to gain' : 'at goal';
  document.getElementById('statGrid').innerHTML = `
    <div class="stat"><div class="num primary">${targets.calories}</div><div class="lbl">Daily calories</div></div>
    <div class="stat"><div class="num">${targets.macros.protein}g</div><div class="lbl">Protein / day</div></div>
    <div class="stat"><div class="num">${targets.bmr}</div><div class="lbl">BMR (at rest)</div></div>
    <div class="stat"><div class="num">${targets.tdee}</div><div class="lbl">Maintenance (TDEE)</div></div>
    <div class="stat"><div class="num">${Math.abs(toGo)}kg</div><div class="lbl">${dir}</div></div>`;

  const m = targets.macros, maxG = Math.max(m.protein, m.carbs, m.fat);
  document.getElementById('targetSummary').innerHTML =
    macroBar('Protein', m.protein, maxG, 'protein') +
    macroBar('Carbs', m.carbs, maxG, 'carbs') +
    macroBar('Fat', m.fat, maxG, 'fat') +
    `<p class="hint" style="text-align:left;margin-top:14px;">Starting targets from the Mifflin–St Jeor formula. Adjust after 2–3 weeks based on real results.</p>`;

  renderQuickSnapshot(u, targets);

  /* ---- Diet ---- */
  renderDiet(u, targets);
  renderMealLog(u, targets);

  /* ---- Cardio ---- */
  const cardio = buildCardioPlan(p.goal);
  document.getElementById('cardioIntro').textContent = cardio.intro;
  document.getElementById('cardioPlan').innerHTML =
    cardio.sessions.map(s => `<div class="cardio-block"><h4>${s.title}</h4><p>${s.detail}</p></div>`).join('') +
    `<div class="card"><h3>Pick any activity you enjoy</h3><ul class="food-list">
      ${CARDIO_OPTIONS.map(o => `<li><span>${o}</span></li>`).join('')}</ul>
      <p class="hint" style="text-align:left">The best cardio is the one you’ll actually do consistently.</p></div>`;

  /* ---- Weight training ---- */
  const eq = { gym: 'full gym', home: 'home equipment', bodyweight: 'bodyweight only' }[p.equipment];
  document.getElementById('workoutIntro').textContent =
    `${p.trainingDays} days/week · ${eq}. Rest 60–120s between sets. Add weight or reps each week.`;
  document.getElementById('workoutPlan').innerHTML = buildWorkoutPlan(p).map(day => `
    <div class="workout-day"><h4>${day.title}</h4>
      <ul class="ex-list">${day.exercises.map(ex => `<li><span>${ex.name}</span><span class="scheme">${ex.scheme}</span></li>`).join('')}</ul></div>`).join('');
  renderStreak(u);

  /* ---- Water ---- */
  renderWater(u);

  /* ---- Progress ---- */
  renderProgress();
}

function macroBar(name, grams, max, cls) {
  const w = max ? Math.round((grams / max) * 100) : 0;
  return `<div class="macro-row"><span class="name">${name}</span>
    <span class="bar"><span class="fill ${cls}" style="width:${w}%"></span></span>
    <span class="val">${grams} g</span></div>`;
}

/* ---- Dashboard "today" snapshot (clickable cards) ---- */
function renderQuickSnapshot(u, targets) {
  const t = todayStr();
  const eaten = (u.meals[t] || []).reduce((s, x) => s + x.kcal, 0);
  const water = u.water[t] || 0;
  const waterGoal = waterGoalGlasses(u.profile.weight);
  const doneToday = !!u.workoutsDone[t];
  const grid = document.getElementById('quickGrid');
  grid.innerHTML = `
    <div class="quick" data-go="diet"><div class="q-emoji">🍽️</div><div class="q-big">${eaten}<span style="font-size:.9rem;color:var(--muted)"> / ${targets.calories}</span></div><div class="q-lbl">Calories eaten today</div></div>
    <div class="quick" data-go="water"><div class="q-emoji">💧</div><div class="q-big">${water}<span style="font-size:.9rem;color:var(--muted)"> / ${waterGoal}</span></div><div class="q-lbl">Glasses of water</div></div>
    <div class="quick" data-go="weights"><div class="q-emoji">${doneToday ? '✅' : '🏋️'}</div><div class="q-big">${doneToday ? 'Done' : 'To do'}</div><div class="q-lbl">Today's training</div></div>
    <div class="quick" data-go="weights"><div class="q-emoji">🔥</div><div class="q-big">${currentStreak(u)}</div><div class="q-lbl">Day streak</div></div>`;
  grid.querySelectorAll('.quick').forEach(c => c.addEventListener('click', () => showView(c.dataset.go)));
}

/* -----------------------------------------------------------
   9b. INDIAN DIET PLAN (cards + recipes + shuffle)
----------------------------------------------------------- */
let planOffset = 0; // bumped by the "New meals" button to swap dishes

function renderDiet(u, targets) {
  const p = u.profile;
  const plan = buildIndianPlan(targets, p.diet, planOffset);
  const dayKcal = plan.reduce((s, mm) => s + mm.kcal, 0);
  const dayProt = plan.reduce((s, mm) => s + mm.protein, 0);
  const dietLabel = { none: 'veg & non-veg', vegetarian: 'vegetarian', vegan: 'vegan' }[p.diet];

  document.getElementById('dietIntro').textContent =
    `${dietLabel} Indian meals matched to your ~${targets.calories} kcal/day. Tap “How to make it” for the recipe.`;

  document.getElementById('dietSummary').innerHTML =
    `Day total ≈ <strong>${dayKcal}</strong> kcal · <strong>${dayProt}g</strong> protein
     <span class="muted-small">(target ${targets.calories} kcal · ${targets.macros.protein}g)</span>`;

  // Honest gap helper — Indian veg diets are often short on protein/calories.
  const protGap = targets.macros.protein - dayProt;
  const kcalGap = targets.calories - dayKcal;
  const bits = [];
  if (protGap > 15) bits.push(`about <strong>${protGap}g more protein</strong> (add curd, paneer, sprouts, soya chunks, or a whey/soy scoop)`);
  if (kcalGap > 200) bits.push(`<strong>~${kcalGap} more kcal</strong> (a bigger portion or an extra snack)`);
  const tip = bits.length ? `<p class="diet-tip">💡 To fully hit your targets, add ${bits.join(' and ')}.</p>` : '';

  document.getElementById('dietPlan').innerHTML = tip + plan.map(mm => `
    <div class="meal">
      <div class="meal-head">
        <h4>${mm.meal} · <span class="meal-dish">${mm.name}</span></h4>
        <span class="meal-time">⏰ ${mm.time}</span>
      </div>
      <div class="kcal">~${mm.kcal} kcal · ${mm.protein}g protein</div>
      <ul class="food-list">
        ${mm.items.map(it => `<li><span>${it.label}</span><span class="scheme">${it.kcal} kcal</span></li>`).join('')}
      </ul>
      <details class="recipe">
        <summary>📖 How to make it</summary>
        <ol class="recipe-steps">${mm.recipe.map(s => `<li>${s}</li>`).join('')}</ol>
      </details>
    </div>`).join('');

  renderFoodPicker(u, targets);
}

document.getElementById('shuffleDiet').addEventListener('click', () => {
  planOffset++;
  const u = DB.current();
  renderDiet(u, buildTargets(u.profile));
});

/* -----------------------------------------------------------
   9c. "WHAT WILL YOU EAT TODAY?" — portion calculator
   You tick the foods you have; it scales your protein foods to
   hit your protein target, then fills remaining calories with
   your chosen carbs. Veg & fats use a sensible fixed serving.
   `per` = kcal/protein per ONE unit (per gram for 'g' foods).
----------------------------------------------------------- */
const FOOD_ITEMS = [
  // Proteins
  { id: 'chicken', name: 'Chicken', emoji: '🍗', cat: 'protein', type: 'nonveg', unit: 'g', per: { kcal: 1.65, protein: 0.31 }, base: 150, step: 10, min: 50, max: 300 },
  { id: 'eggs', name: 'Eggs', emoji: '🥚', cat: 'protein', type: 'nonveg', unit: 'egg', per: { kcal: 78, protein: 6.3 }, base: 2, step: 1, min: 1, max: 6 },
  { id: 'paneer', name: 'Paneer', emoji: '🧀', cat: 'protein', type: 'veg', unit: 'g', per: { kcal: 2.65, protein: 0.18 }, base: 60, step: 10, min: 30, max: 200 },
  { id: 'curd', name: 'Curd', emoji: '🥛', cat: 'protein', type: 'veg', unit: 'g', per: { kcal: 0.6, protein: 0.035 }, base: 150, step: 25, min: 50, max: 400 },
  { id: 'tofu', name: 'Tofu', emoji: '⬜', cat: 'protein', type: 'vegan', unit: 'g', per: { kcal: 1.45, protein: 0.16 }, base: 100, step: 10, min: 50, max: 250 },
  { id: 'soya', name: 'Soya chunks', emoji: '🟤', cat: 'protein', type: 'vegan', unit: 'g', per: { kcal: 3.45, protein: 0.52 }, base: 30, step: 5, min: 15, max: 80, note: 'dry' },
  { id: 'dal', name: 'Dal', emoji: '🍲', cat: 'protein', type: 'vegan', unit: 'katori', per: { kcal: 140, protein: 8 }, base: 1, step: 0.5, min: 0.5, max: 3 },
  // Carbs
  { id: 'roti', name: 'Roti', emoji: '🫓', cat: 'carb', type: 'vegan', unit: 'roti', per: { kcal: 75, protein: 2.5 }, base: 2, step: 1, min: 1, max: 8 },
  { id: 'rice', name: 'Rice', emoji: '🍚', cat: 'carb', type: 'vegan', unit: 'katori', per: { kcal: 200, protein: 4 }, base: 1, step: 0.5, min: 0.5, max: 4, note: 'cooked' },
  { id: 'oats', name: 'Oats', emoji: '🌾', cat: 'carb', type: 'vegan', unit: 'g', per: { kcal: 3.89, protein: 0.13 }, base: 40, step: 5, min: 20, max: 100, note: 'dry' },
  { id: 'poha', name: 'Poha', emoji: '🥣', cat: 'carb', type: 'vegan', unit: 'katori', per: { kcal: 130, protein: 2.5 }, base: 1.5, step: 0.5, min: 1, max: 3 },
  // Veggies (fixed serving)
  { id: 'veggies', name: 'Veggies', emoji: '🥦', cat: 'veg', type: 'vegan', unit: 'g', per: { kcal: 0.4, protein: 0.02 }, base: 200, step: 25, min: 100, max: 400 },
  // Fats (fixed serving)
  { id: 'peanut', name: 'Peanut butter', emoji: '🥜', cat: 'fat', type: 'vegan', unit: 'g', per: { kcal: 5.9, protein: 0.25 }, base: 15, step: 5, min: 5, max: 40 },
  { id: 'almonds', name: 'Almonds', emoji: '🌰', cat: 'fat', type: 'vegan', unit: 'g', per: { kcal: 5.8, protein: 0.21 }, base: 15, step: 5, min: 5, max: 40 },
];
const CAT_LABEL = { protein: '💪 Proteins', carb: '🍚 Carbs', veg: '🥦 Veggies', fat: '🥜 Fats' };

function qtyLabel(item, qty) {
  if (item.unit === 'g') return `${qty} g`;
  return `${formatCount(qty)} ${pluralUnit(item.unit, qty)}`;
}
const roundStep = (v, step) => Math.max(0, Math.round(v / step) * step);
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

// Core: turn a list of chosen foods into exact quantities.
function computePortions(items, targets) {
  const rows = [];
  let kcal = 0, protein = 0;
  const add = (item, qty) => {
    const k = Math.round(qty * item.per.kcal), pr = qty * item.per.protein;
    rows.push({ item, qty, kcal: k, protein: pr }); kcal += k; protein += pr;
  };
  // Veggies & fats: sensible fixed serving (for fibre/micros & healthy fats)
  items.filter(i => i.cat === 'veg' || i.cat === 'fat').forEach(i => add(i, i.base));

  // Proteins: scale together so they hit the remaining protein target
  const proteins = items.filter(i => i.cat === 'protein');
  if (proteins.length) {
    const baseProt = proteins.reduce((s, i) => s + i.base * i.per.protein, 0);
    const need = Math.max(targets.macros.protein - protein, 0);
    const scale = baseProt > 0 ? need / baseProt : 0;
    proteins.forEach(i => add(i, clamp(roundStep(i.base * scale, i.step), i.min, i.max)));
  }
  // Carbs: scale to fill the calories left after protein/veg/fat
  const carbs = items.filter(i => i.cat === 'carb');
  if (carbs.length) {
    const remaining = targets.calories - kcal;
    const baseKcal = carbs.reduce((s, i) => s + i.base * i.per.kcal, 0);
    const scale = baseKcal > 0 ? Math.max(remaining, 0) / baseKcal : 0;
    carbs.forEach(i => add(i, clamp(roundStep(i.base * scale, i.step), i.min, i.max)));
  }
  return { rows, kcal: Math.round(kcal), protein: Math.round(protein) };
}

function renderFoodPicker(u, targets) {
  const diet = u.profile.diet;
  const allowed = FOOD_ITEMS.filter(i => dishAllowed(i, diet));
  const chosen = new Set(u.foodPicker);

  // Build chips grouped by category
  const chipsHtml = ['protein', 'carb', 'veg', 'fat'].map(cat => {
    const list = allowed.filter(i => i.cat === cat);
    if (!list.length) return '';
    return `<div class="chip-group"><div class="chip-cat">${CAT_LABEL[cat]}</div>
      <div class="chips">${list.map(i =>
        `<button class="chip ${chosen.has(i.id) ? 'on' : ''}" data-id="${i.id}">${i.emoji} ${i.name}</button>`).join('')}</div></div>`;
  }).join('');
  document.getElementById('foodChips').innerHTML = chipsHtml;
  document.querySelectorAll('#foodChips .chip').forEach(c => c.addEventListener('click', () => {
    const user = DB.current(); const id = c.dataset.id;
    user.foodPicker = chosen.has(id) ? user.foodPicker.filter(x => x !== id) : [...user.foodPicker, id];
    DB.saveCurrent(user);
    renderFoodPicker(user, targets);
  }));

  // Results
  const sel = allowed.filter(i => chosen.has(i.id));
  const res = document.getElementById('pickerResult');
  if (!sel.length) {
    res.innerHTML = `<p class="hint" style="text-align:left">👆 Tick the foods you have today and I'll give you the exact amount of each.</p>`;
    return;
  }
  const { rows, kcal, protein } = computePortions(sel, targets);
  const pTarget = targets.macros.protein, cTarget = targets.calories;
  const proteinOk = protein >= pTarget * 0.95;
  const calorieOk = Math.abs(kcal - cTarget) <= cTarget * 0.1;

  const rowsHtml = rows.map(r =>
    `<li><span>${r.item.emoji} ${r.item.name}${r.item.note ? ` <span class="muted-small">(${r.item.note})</span>` : ''}</span>
       <span><strong>${qtyLabel(r.item, r.qty)}</strong> <span class="muted-small">· ${r.kcal} kcal · ${Math.round(r.protein)}g P</span></span></li>`).join('');

  const tips = [];
  if (!sel.some(i => i.cat === 'protein')) tips.push('Add at least one protein (chicken, paneer, tofu, dal, eggs…) — otherwise you can’t hit your protein target.');
  else if (!proteinOk) tips.push(`You're ${Math.round(pTarget - protein)}g short on protein even at max portions — add another protein food or a whey/soy scoop.`);
  if (kcal < cTarget - 150) tips.push(sel.some(i => i.cat === 'carb')
    ? `You're ~${cTarget - kcal} kcal short — increase a carb portion or add another carb/snack.`
    : 'Add a carb (roti, rice, oats…) to reach your calories.');
  if (kcal > cTarget + 150) tips.push('This combo runs high on calories — drop a carb portion or pick leaner proteins.');

  res.innerHTML = `
    <ul class="portion-list">${rowsHtml}</ul>
    <div class="portion-totals">
      <span class="${proteinOk ? 'ok' : 'warn'}">${proteinOk ? '✅' : '⚠️'} Protein ${protein}g / ${pTarget}g</span>
      <span class="${calorieOk ? 'ok' : 'warn'}">${calorieOk ? '✅' : '⚠️'} Calories ${kcal} / ${cTarget}</span>
    </div>
    ${tips.map(t => `<p class="diet-tip">💡 ${t}</p>`).join('')}`;
}

/* -----------------------------------------------------------
   9d. AI FEATURES (Google Gemini — bring your own key)
   The key is stored ONLY in this browser's localStorage and is
   never committed to the code or uploaded anywhere by us.
----------------------------------------------------------- */
const AI = {
  key: () => localStorage.getItem('t100_gemini_key') || '',
  model: () => localStorage.getItem('t100_gemini_model') || 'gemini-2.5-flash',
  setKey: k => localStorage.setItem('t100_gemini_key', k),
  setModel: m => localStorage.setItem('t100_gemini_model', m || 'gemini-2.5-flash'),
  clear: () => { localStorage.removeItem('t100_gemini_key'); localStorage.removeItem('t100_gemini_model'); },
};
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Ask the model for text. Throws an Error with a friendly message on failure.
async function askGemini(prompt) {
  const key = AI.key();
  if (!key) throw new Error('NO_KEY');
  const url = `${GEMINI_BASE}/models/${AI.model()}:generateContent?key=${encodeURIComponent(key)}`;
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.8 } }),
    });
  } catch (e) { throw new Error('Network error — check your internet connection.'); }
  if (!res.ok) {
    let msg = `Request failed (HTTP ${res.status}).`;
    try { const j = await res.json(); if (j.error && j.error.message) msg = j.error.message; } catch (e) {}
    if (res.status === 400 || res.status === 403) msg += ' Double-check your API key.';
    if (res.status === 404) msg += ' That model name may be wrong — hit “Test connection” to see valid models.';
    if (res.status === 429) msg = 'Rate limit reached — wait a minute and try again.';
    throw new Error(msg);
  }
  const data = await res.json();
  const text = (data.candidates && data.candidates[0] && data.candidates[0].content
    && data.candidates[0].content.parts || []).map(p => p.text).join('');
  if (!text) throw new Error('The model returned an empty response. Try again.');
  return text;
}

// List models the key can use (for the Test button).
async function listGeminiModels() {
  const key = AI.key();
  if (!key) throw new Error('NO_KEY');
  const res = await fetch(`${GEMINI_BASE}/models?key=${encodeURIComponent(key)}`);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); if (j.error && j.error.message) msg = j.error.message; } catch (e) {}
    throw new Error(msg);
  }
  const data = await res.json();
  return (data.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => m.name.replace('models/', ''));
}

// Tiny, safe Markdown -> HTML (bold, italics, headings, bullet/number lists).
function escapeHtml(s) { return s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function mdLite(text) {
  const inline = s => s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*([^*]+?)\*/g, '$1<em>$2</em>');
  let html = '', inList = false;
  escapeHtml(text).split('\n').forEach(raw => {
    const line = raw.trim();
    const close = () => { if (inList) { html += '</ul>'; inList = false; } };
    if (/^#{1,6}\s/.test(line)) { close(); html += `<h4>${inline(line.replace(/^#{1,6}\s/, ''))}</h4>`; return; }
    const li = line.match(/^[-*]\s+(.*)/) || line.match(/^\d+[.)]\s+(.*)/);
    if (li) { if (!inList) { html += '<ul>'; inList = true; } html += `<li>${inline(li[1])}</li>`; return; }
    close();
    if (line) html += `<p>${inline(line)}</p>`;
  });
  if (inList) html += '</ul>';
  return html;
}

// Build a short context line about the user for better prompts.
function profileContext() {
  const u = DB.current();
  if (!u || !u.profile) return '';
  const p = u.profile, t = buildTargets(p);
  const dmap = { none: 'eats both veg and non-veg', vegetarian: 'vegetarian (no meat or egg; dairy is fine)', vegan: 'vegan (no animal products)' };
  return `The user is a ${p.age}-year-old ${p.sex}, ${p.weight}kg, goal: ${p.goal} weight, ${dmap[p.diet]}. ` +
    `Daily targets: about ${t.calories} kcal and ${t.macros.protein}g protein. Prefers Indian food.`;
}

const aiResultEl = () => document.getElementById('aiResult');
async function runAI(prompt, label) {
  const el = aiResultEl();
  el.innerHTML = `<p class="ai-loading">✨ ${label || 'Thinking'}…</p>`;
  try {
    const text = await askGemini(prompt);
    el.innerHTML = mdLite(text);
  } catch (e) {
    if (e.message === 'NO_KEY') {
      el.innerHTML = `<p class="ai-error">🔑 Add your Gemini API key first — go to <strong>Profile → AI features</strong>.</p>`;
    } else {
      el.innerHTML = `<p class="ai-error">⚠️ ${escapeHtml(e.message)}</p>`;
    }
  }
}

// AI Chef buttons
document.querySelectorAll('#aiChef .ai-btn').forEach(btn => btn.addEventListener('click', () => {
  const kind = btn.dataset.ai;
  const input = document.getElementById('aiInput').value.trim();
  const ctx = profileContext();
  if (kind === 'plan') {
    runAI(`${ctx}\nCreate a simple 1-day Indian meal plan (breakfast, lunch, snack, dinner) with exact home quantities (grams, katori, rotis) that roughly meets the targets. Use short headings and bullet points. Keep it practical to cook at home.`, 'Cooking up a plan');
  } else if (kind === 'recipe') {
    if (!input) return focusAiInput('Type a dish name above, then tap “Recipe for…”.');
    runAI(`Give a simple Indian-style home recipe for "${input}". List ingredients with quantities, then numbered steps. Keep it concise and beginner-friendly.`, 'Writing the recipe');
  } else if (kind === 'substitute') {
    if (!input) return focusAiInput('Type a food above, then tap “Substitute for…”.');
    runAI(`${ctx}\nSuggest 3 healthy Indian substitutes for "${input}" with similar nutrition. For each, give the swap amount and a one-line reason. Use bullet points.`, 'Finding substitutes');
  }
}));
document.getElementById('aiAsk').addEventListener('click', () => {
  const input = document.getElementById('aiInput').value.trim();
  if (!input) return focusAiInput('Type your question above first.');
  runAI(`${profileContext()}\nUser question about diet/fitness: ${input}\nAnswer helpfully and concisely with Indian food in mind. Use bullet points where useful.`, 'Thinking');
});
function focusAiInput(msg) {
  aiResultEl().innerHTML = `<p class="ai-error">${msg}</p>`;
  document.getElementById('aiInput').focus();
}

// AI settings (Profile)
function populateAISettings() {
  document.getElementById('geminiKey').value = AI.key();
  document.getElementById('geminiModel').value = AI.model();
  const has = !!AI.key();
  document.getElementById('aiStatus').innerHTML = has
    ? '✅ A key is saved in this browser. AI Chef is ready in the Diet tab.'
    : 'No key yet. Paste one above and press Save. (See the in-app guide for how to get one.)';
}
document.getElementById('saveKey').addEventListener('click', () => {
  const k = document.getElementById('geminiKey').value.trim();
  AI.setKey(k); AI.setModel(document.getElementById('geminiModel').value.trim());
  document.getElementById('aiStatus').textContent = k ? '✅ Saved in this browser. Try the AI Chef in the Diet tab!' : '⚠️ Key field was empty.';
});
document.getElementById('clearKey').addEventListener('click', () => {
  AI.clear(); document.getElementById('geminiKey').value = ''; document.getElementById('geminiModel').value = '';
  document.getElementById('aiStatus').textContent = '🗑️ Key removed from this browser.';
});
document.getElementById('testKey').addEventListener('click', async () => {
  const status = document.getElementById('aiStatus');
  const k = document.getElementById('geminiKey').value.trim();
  if (k) { AI.setKey(k); AI.setModel(document.getElementById('geminiModel').value.trim()); }
  status.textContent = '⏳ Testing your key…';
  try {
    const models = await listGeminiModels();
    const flash = models.filter(m => m.includes('flash'));
    const current = AI.model();
    const ok = models.includes(current);
    status.innerHTML = `✅ Key works! ${ok ? `Model “${current}” is valid.` : `⚠️ “${current}” not found — pick one below.`}` +
      `<br>Available flash models: ${(flash.length ? flash : models).slice(0, 6).join(', ')}`;
  } catch (e) {
    status.innerHTML = `<span class="ai-error">⚠️ ${escapeHtml(e.message === 'NO_KEY' ? 'Enter a key first.' : e.message)}</span>`;
  }
});

/* -----------------------------------------------------------
   10. MEAL / CALORIE LOG
----------------------------------------------------------- */
document.getElementById('mealForm').addEventListener('submit', e => {
  e.preventDefault();
  const name = document.getElementById('mealName').value.trim();
  const kcal = Number(document.getElementById('mealKcal').value);
  if (!name || !kcal) return;
  const u = DB.current(), t = todayStr();
  (u.meals[t] = u.meals[t] || []).push({ name, kcal });
  DB.saveCurrent(u);
  e.target.reset();
  renderAll();
  showView('diet');
});
function renderMealLog(u, targets) {
  const t = todayStr();
  const items = u.meals[t] || [];
  const eaten = items.reduce((s, x) => s + x.kcal, 0);
  const pct = Math.min(Math.round((eaten / targets.calories) * 100), 100);
  const over = eaten > targets.calories;
  document.getElementById('calorieBar').innerHTML = `
    <div class="cal-label"><span>Eaten: <strong>${eaten}</strong> kcal</span>
      <span>${over ? 'Over by ' + (eaten - targets.calories) : 'Target ' + targets.calories} kcal</span></div>
    <div class="cal-track"><div class="cal-fill ${over ? 'over' : ''}" style="width:${pct}%"></div></div>`;
  const log = document.getElementById('mealLog');
  log.innerHTML = items.length
    ? items.map((it, i) => `<li><span>${it.name}</span><span>${it.kcal} kcal
        <button class="del-btn" data-i="${i}" title="Remove">✕</button></span></li>`).join('')
    : `<li><span class="hint" style="margin:0">Nothing logged yet today.</span></li>`;
  log.querySelectorAll('.del-btn').forEach(b => b.addEventListener('click', () => {
    const user = DB.current(); user.meals[t].splice(Number(b.dataset.i), 1); DB.saveCurrent(user); renderAll();
  }));
}

/* -----------------------------------------------------------
   11. WATER TRACKER
----------------------------------------------------------- */
// ~35 ml per kg bodyweight, 250 ml per glass, clamped to a sane range.
function waterGoalGlasses(weight) {
  return Math.min(Math.max(Math.round((weight * 35) / 250), 6), 16);
}
function setWater(n) {
  const u = DB.current(), t = todayStr();
  u.water[t] = Math.max(0, n);
  DB.saveCurrent(u);
  renderWater(u);
  renderQuickSnapshot(u, buildTargets(u.profile));
}
function renderWater(u) {
  const t = todayStr();
  const goal = waterGoalGlasses(u.profile.weight);
  const count = u.water[t] || 0;
  document.getElementById('waterIntro').textContent = `Your goal: ${goal} glasses (250 ml) ≈ ${(goal * 0.25).toFixed(1)} litres a day.`;
  const total = Math.max(goal, count);
  let glasses = '';
  for (let i = 0; i < total; i++) glasses += `<span class="glass ${i < count ? 'full' : ''}" data-n="${i + 1}">🥤</span>`;
  document.getElementById('waterCard').innerHTML = `
    <div class="water-count"><span>${count}</span> / ${goal} glasses</div>
    <div class="glasses">${glasses}</div>
    <div class="water-btns"><button id="waterMinus">−</button><button id="waterPlus">+</button></div>
    <p class="hint">Tap a glass to set your count, or use − / +.</p>`;
  document.getElementById('waterPlus').addEventListener('click', () => setWater(count + 1));
  document.getElementById('waterMinus').addEventListener('click', () => setWater(count - 1));
  document.querySelectorAll('.glass').forEach(g => g.addEventListener('click', () => {
    const n = Number(g.dataset.n);
    setWater(n === count ? n - 1 : n); // tapping the last full glass empties it
  }));
}

/* -----------------------------------------------------------
   12. WORKOUT STREAK
----------------------------------------------------------- */
function currentStreak(u) {
  const done = u.workoutsDone;
  let streak = 0;
  let d = todayStr();
  if (!done[d]) d = shiftDate(d, -1); // today not done yet? streak can still run up to yesterday
  while (done[d]) { streak++; d = shiftDate(d, -1); }
  return streak;
}
function weeklyCount(u) {
  let c = 0;
  for (let i = 0; i < 7; i++) if (u.workoutsDone[shiftDate(todayStr(), -i)]) c++;
  return c;
}
function renderStreak(u) {
  const t = todayStr();
  const done = !!u.workoutsDone[t];
  document.getElementById('streakCard').innerHTML = `
    <div class="streak-main">
      <span class="streak-flame">🔥</span>
      <div><div class="streak-num">${currentStreak(u)} day streak</div>
      <div class="streak-sub">${weeklyCount(u)} session(s) this week</div></div>
    </div>
    <button id="markDone" class="btn-primary ${done ? '' : 'btn-hot'}" style="width:auto">
      ${done ? '✅ Completed today (undo)' : "Mark today's workout complete"}</button>`;
  document.getElementById('markDone').addEventListener('click', () => {
    const user = DB.current();
    if (user.workoutsDone[t]) delete user.workoutsDone[t];
    else user.workoutsDone[t] = true;
    DB.saveCurrent(user);
    renderStreak(user);
    renderQuickSnapshot(user, buildTargets(user.profile));
  });
}

/* -----------------------------------------------------------
   13. PROGRESS (weight log + chart)
----------------------------------------------------------- */
document.getElementById('progressForm').addEventListener('submit', e => {
  e.preventDefault();
  const date = document.getElementById('logDate').value;
  const w = Number(document.getElementById('logWeight').value);
  if (!date || !w) return;
  const u = DB.current();
  const ex = u.progress.find(en => en.date === date);
  if (ex) ex.weight = w; else u.progress.push({ date, weight: w });
  u.progress.sort((a, b) => a.date.localeCompare(b.date));
  DB.saveCurrent(u);
  e.target.reset();
  document.getElementById('logDate').value = todayStr();
  renderProgress();
});
function renderProgress() {
  const u = DB.current();
  const entries = u.progress || [];
  const tbody = document.querySelector('#progressTable tbody');
  tbody.innerHTML = entries.slice().reverse().map((en, i, arr) => {
    const prev = arr[i + 1]; let change = '';
    if (prev) {
      const diff = (en.weight - prev.weight).toFixed(1);
      const cls = diff > 0 ? 'up' : diff < 0 ? 'down' : ''; const sign = diff > 0 ? '+' : '';
      change = `<span class="${cls}">${sign}${diff} kg</span>`;
    }
    return `<tr><td>${en.date}</td><td>${en.weight} kg</td><td>${change}</td>
      <td><button class="del-btn" data-date="${en.date}" title="Delete">✕</button></td></tr>`;
  }).join('');
  tbody.querySelectorAll('.del-btn').forEach(b => b.addEventListener('click', () => {
    const user = DB.current(); user.progress = user.progress.filter(en => en.date !== b.dataset.date);
    DB.saveCurrent(user); renderProgress();
  }));
  document.getElementById('progressEmpty').classList.toggle('hidden', entries.length > 0);
  drawChart(entries, u.profile ? u.profile.goalWeight : null);
}
function drawChart(entries, goalWeight) {
  const canvas = document.getElementById('progressChart');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, pad = 40;
  ctx.clearRect(0, 0, W, H);
  if (entries.length === 0) return;
  const weights = entries.map(e => e.weight);
  if (goalWeight) weights.push(goalWeight);
  let min = Math.min(...weights), max = Math.max(...weights);
  if (min === max) { min -= 1; max += 1; }
  const p10 = (max - min) * 0.1; min -= p10; max += p10;
  const x = i => pad + (i / Math.max(entries.length - 1, 1)) * (W - pad * 2);
  const y = v => H - pad - ((v - min) / (max - min)) * (H - pad * 2);
  ctx.strokeStyle = '#2b3160'; ctx.fillStyle = '#9aa3c7'; ctx.font = '12px system-ui'; ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const val = max - (g / 4) * (max - min); const gy = pad + (g / 4) * (H - pad * 2);
    ctx.beginPath(); ctx.moveTo(pad, gy); ctx.lineTo(W - pad, gy); ctx.stroke();
    ctx.fillText(val.toFixed(1), 4, gy + 4);
  }
  if (goalWeight) {
    ctx.save(); ctx.setLineDash([6, 6]); ctx.strokeStyle = '#28d39f';
    ctx.beginPath(); ctx.moveTo(pad, y(goalWeight)); ctx.lineTo(W - pad, y(goalWeight)); ctx.stroke();
    ctx.fillStyle = '#28d39f'; ctx.fillText('Goal', W - pad - 34, y(goalWeight) - 6); ctx.restore();
  }
  ctx.strokeStyle = '#6c5cff'; ctx.lineWidth = 2.5; ctx.beginPath();
  entries.forEach((e, i) => i === 0 ? ctx.moveTo(x(i), y(e.weight)) : ctx.lineTo(x(i), y(e.weight)));
  ctx.stroke();
  ctx.fillStyle = '#b14bff';
  entries.forEach((e, i) => { ctx.beginPath(); ctx.arc(x(i), y(e.weight), 4, 0, Math.PI * 2); ctx.fill(); });
}

/* -----------------------------------------------------------
   14. STARTUP
----------------------------------------------------------- */
let sloganTimer = null;
function enterApp() {
  document.getElementById('authScreen').classList.add('hidden');
  document.getElementById('appShell').classList.remove('hidden');
  const u = DB.current();
  document.getElementById('logDate').value = todayStr();
  if (u.profile) { renderAll(); showView('dashboard'); }
  else { showView('profile'); }
  // Rotate the dashboard slogan every few seconds for a lively feel.
  document.getElementById('dashSlogan').textContent = randomSlogan();
  clearInterval(sloganTimer);
  sloganTimer = setInterval(() => {
    document.getElementById('dashSlogan').textContent = randomSlogan();
  }, 6000);
}
(function init() {
  document.getElementById('authSlogan').textContent = randomSlogan();
  if (DB.session() && DB.current()) enterApp();
  // otherwise the auth screen is already showing by default
})();
