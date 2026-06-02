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
const FOODS = {
  protein: [
    { name: 'Chicken breast', diet: 'none' }, { name: 'Lean beef', diet: 'none' },
    { name: 'Eggs / egg whites', diet: 'vegetarian' }, { name: 'Salmon or white fish', diet: 'none' },
    { name: 'Greek yogurt', diet: 'vegetarian' }, { name: 'Cottage cheese', diet: 'vegetarian' },
    { name: 'Tofu / tempeh', diet: 'vegan' }, { name: 'Lentils & beans', diet: 'vegan' },
    { name: 'Edamame', diet: 'vegan' }, { name: 'Pea / soy protein shake', diet: 'vegan' },
  ],
  carbs: [
    { name: 'Oats', diet: 'vegan' }, { name: 'Brown rice', diet: 'vegan' },
    { name: 'Sweet potato', diet: 'vegan' }, { name: 'Whole-grain bread', diet: 'vegan' },
    { name: 'Quinoa', diet: 'vegan' }, { name: 'Banana / berries', diet: 'vegan' },
  ],
  fat: [
    { name: 'Avocado', diet: 'vegan' }, { name: 'Almonds / walnuts', diet: 'vegan' },
    { name: 'Olive oil', diet: 'vegan' }, { name: 'Peanut butter', diet: 'vegan' },
  ],
  veg: [
    { name: 'Broccoli', diet: 'vegan' }, { name: 'Spinach', diet: 'vegan' },
    { name: 'Mixed salad', diet: 'vegan' }, { name: 'Bell peppers', diet: 'vegan' },
  ],
};
function foodAllowed(f, diet) {
  if (diet === 'none') return true;
  if (diet === 'vegetarian') return f.diet !== 'none';
  if (diet === 'vegan') return f.diet === 'vegan';
  return true;
}
const pick = (list, diet, n) => list.filter(f => foodAllowed(f, diet)).slice(0, n).map(f => f.name);

const MEAL_SPLIT = [
  { name: 'Breakfast', pct: 0.25 }, { name: 'Lunch', pct: 0.30 },
  { name: 'Dinner', pct: 0.30 }, { name: 'Snack', pct: 0.15 },
];
function buildDietPlan(targets, diet) {
  return MEAL_SPLIT.map(meal => ({
    name: meal.name,
    kcal: Math.round(targets.calories * meal.pct),
    foods: [
      ...pick(FOODS.protein, diet, 2), ...pick(FOODS.carbs, diet, 1),
      ...pick(FOODS.veg, diet, 1), ...(meal.name === 'Snack' ? pick(FOODS.fat, diet, 1) : []),
    ],
  }));
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
    if (btn.dataset.view === 'profile') fillProfileForm();
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
  document.getElementById('dietIntro').textContent =
    `Aim for ~${targets.calories} kcal/day across 4 meals. Mix and match the suggested foods.`;
  document.getElementById('dietPlan').innerHTML = buildDietPlan(targets, p.diet).map(meal => `
    <div class="meal"><h4>${meal.name}</h4><div class="kcal">~${meal.kcal} kcal</div>
      <ul class="food-list">${meal.foods.map(f => `<li><span>${f}</span></li>`).join('')}</ul></div>`).join('');
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
