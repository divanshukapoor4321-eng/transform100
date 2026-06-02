/* ===========================================================
   Transform100 — app.js
   All the logic lives here. Read top-to-bottom; each section
   is labelled. Nothing here needs the internet — it all runs
   in your browser and saves to your browser's local storage.
   =========================================================== */

/* -----------------------------------------------------------
   1. STORAGE HELPERS
   We keep everything in localStorage (a little database built
   into every browser). Two keys:
     t100_users   -> all accounts + their data
     t100_session -> which user is currently logged in
   NOTE: passwords are stored in plain text here. That is fine
   for a personal/offline learning app, but is NOT secure for a
   real public website. We'll swap this for a real server later.
----------------------------------------------------------- */
const DB = {
  users() { return JSON.parse(localStorage.getItem('t100_users') || '{}'); },
  saveUsers(u) { localStorage.setItem('t100_users', JSON.stringify(u)); },
  session() { return localStorage.getItem('t100_session'); },
  setSession(name) { localStorage.setItem('t100_session', name); },
  clearSession() { localStorage.removeItem('t100_session'); },

  // Get the currently logged-in user object (or null).
  current() {
    const name = this.session();
    if (!name) return null;
    return this.users()[name] || null;
  },
  // Save changes back to the current user.
  saveCurrent(userObj) {
    const users = this.users();
    users[this.session()] = userObj;
    this.saveUsers(users);
  }
};

/* -----------------------------------------------------------
   2. FITNESS FORMULAS  (the "rule-based engine")
----------------------------------------------------------- */

// Mifflin–St Jeor: the most accurate simple BMR formula.
// BMR = calories your body burns at complete rest.
function calcBMR({ sex, weight, height, age }) {
  const base = 10 * weight + 6.25 * height - 5 * age;
  return Math.round(sex === 'male' ? base + 5 : base - 161);
}

// TDEE = BMR x activity multiplier = maintenance calories.
function calcTDEE(bmr, activity) {
  return Math.round(bmr * Number(activity));
}

// Adjust maintenance calories based on the goal.
function calcCalorieTarget(tdee, goal) {
  if (goal === 'lose') return tdee - 500;   // ~0.45 kg fat loss / week
  if (goal === 'gain') return tdee + 300;   // lean gaining
  return tdee;                              // maintain
}

// Split daily calories into protein / carbs / fat (grams).
// Protein is set per kg of bodyweight (muscle-protective),
// fat is ~25% of calories, carbs fill the rest.
// Calories per gram: protein 4, carbs 4, fat 9.
function calcMacros(calories, weight, goal) {
  const proteinPerKg = goal === 'lose' ? 2.2 : 2.0;
  const protein = Math.round(weight * proteinPerKg);
  const fat = Math.round((calories * 0.25) / 9);
  const carbs = Math.round((calories - (protein * 4 + fat * 9)) / 4);
  return { protein, carbs: Math.max(carbs, 0), fat };
}

// Bundle every derived number a profile produces.
function buildTargets(p) {
  const bmr = calcBMR(p);
  const tdee = calcTDEE(bmr, p.activity);
  const calories = calcCalorieTarget(tdee, p.goal);
  const macros = calcMacros(calories, p.weight, p.goal);
  return { bmr, tdee, calories, macros };
}

/* -----------------------------------------------------------
   3. DIET PLAN GENERATOR
   We split daily calories across meals and suggest foods from
   a small library, filtered by dietary preference.
----------------------------------------------------------- */

const FOODS = {
  protein: [
    { name: 'Chicken breast', diet: 'none' },
    { name: 'Lean beef', diet: 'none' },
    { name: 'Eggs / egg whites', diet: 'vegetarian' },
    { name: 'Salmon or white fish', diet: 'none' },
    { name: 'Greek yogurt', diet: 'vegetarian' },
    { name: 'Cottage cheese', diet: 'vegetarian' },
    { name: 'Tofu / tempeh', diet: 'vegan' },
    { name: 'Lentils & beans', diet: 'vegan' },
    { name: 'Edamame', diet: 'vegan' },
    { name: 'Pea / soy protein shake', diet: 'vegan' },
  ],
  carbs: [
    { name: 'Oats', diet: 'vegan' },
    { name: 'Brown rice', diet: 'vegan' },
    { name: 'Sweet potato', diet: 'vegan' },
    { name: 'Whole-grain bread', diet: 'vegan' },
    { name: 'Quinoa', diet: 'vegan' },
    { name: 'Banana / berries', diet: 'vegan' },
    { name: 'Whole-wheat pasta', diet: 'vegan' },
  ],
  fat: [
    { name: 'Avocado', diet: 'vegan' },
    { name: 'Almonds / walnuts', diet: 'vegan' },
    { name: 'Olive oil', diet: 'vegan' },
    { name: 'Peanut butter', diet: 'vegan' },
    { name: 'Chia / flax seeds', diet: 'vegan' },
  ],
  veg: [
    { name: 'Broccoli', diet: 'vegan' },
    { name: 'Spinach', diet: 'vegan' },
    { name: 'Mixed salad', diet: 'vegan' },
    { name: 'Bell peppers', diet: 'vegan' },
    { name: 'Green beans', diet: 'vegan' },
  ],
};

// Which diets a food fits. A "vegan" food fits everyone;
// a "vegetarian" food fits vegetarians + no-restriction;
// a "none" food fits only no-restriction eaters.
function foodAllowed(food, diet) {
  if (diet === 'none') return true;
  if (diet === 'vegetarian') return food.diet !== 'none';
  if (diet === 'vegan') return food.diet === 'vegan';
  return true;
}

function pick(list, diet, n) {
  return list.filter(f => foodAllowed(f, diet)).slice(0, n).map(f => f.name);
}

// Calorie split across 4 meals (percentages of the daily total).
const MEAL_SPLIT = [
  { name: 'Breakfast', pct: 0.25 },
  { name: 'Lunch',     pct: 0.30 },
  { name: 'Dinner',    pct: 0.30 },
  { name: 'Snack',     pct: 0.15 },
];

function buildDietPlan(targets, diet) {
  return MEAL_SPLIT.map(meal => ({
    name: meal.name,
    kcal: Math.round(targets.calories * meal.pct),
    foods: [
      ...pick(FOODS.protein, diet, 2),
      ...pick(FOODS.carbs, diet, 1),
      ...pick(FOODS.veg, diet, 1),
      ...(meal.name === 'Snack' ? pick(FOODS.fat, diet, 1) : []),
    ],
  }));
}

/* -----------------------------------------------------------
   4. WORKOUT PLAN GENERATOR
   Choose a training split from the # of days, then fill each
   day with exercises from the right equipment library. Sets &
   reps depend on the goal.
----------------------------------------------------------- */

// Rep scheme by goal.
function repScheme(goal) {
  if (goal === 'gain') return '4 × 8–12';     // hypertrophy
  if (goal === 'lose') return '3 × 12–15';    // higher reps / conditioning
  return '4 × 8–10';                          // maintain / recomp
}

// Exercise libraries keyed by equipment, then by muscle group.
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
    push: ['Push-ups', 'Pike push-ups', 'Dips (chair)', 'Diamond push-ups'],
    pull: ['Inverted rows (under a table)', 'Doorway rows', 'Superman holds', 'Towel curls'],
    legs: ['Bodyweight squats', 'Reverse lunges', 'Glute bridges', 'Calf raises'],
    upper: ['Push-ups', 'Inverted rows', 'Pike push-ups', 'Dips'],
    lower: ['Bodyweight squats', 'Reverse lunges', 'Glute bridges', 'Calf raises'],
    full: ['Bodyweight squats', 'Push-ups', 'Inverted rows', 'Plank', 'Glute bridges'],
  },
};

// Pick a split layout based on how many days the user trains.
function chooseSplit(days) {
  if (days <= 3) return ['full', 'full', 'full'];
  if (days === 4) return ['upper', 'lower', 'upper', 'lower'];
  if (days === 5) return ['push', 'pull', 'legs', 'upper', 'lower'];
  return ['push', 'pull', 'legs', 'push', 'pull', 'legs']; // 6 days
}

function buildWorkoutPlan(profile) {
  const days = Number(profile.trainingDays);
  const split = chooseSplit(days);
  const lib = EXERCISES[profile.equipment];
  const scheme = repScheme(profile.goal);
  const labels = { push: 'Push', pull: 'Pull', legs: 'Legs', upper: 'Upper body', lower: 'Lower body', full: 'Full body' };

  return split.map((group, i) => ({
    title: `Day ${i + 1} — ${labels[group]}`,
    exercises: lib[group].map(name => ({ name, scheme })),
  }));
}

/* -----------------------------------------------------------
   5. VIEW SWITCHING (which screen is showing)
----------------------------------------------------------- */
const views = {
  auth:      document.getElementById('authView'),
  profile:   document.getElementById('profileView'),
  dashboard: document.getElementById('dashboardView'),
  diet:      document.getElementById('dietView'),
  workout:   document.getElementById('workoutView'),
  progress:  document.getElementById('progressView'),
};

function showView(name) {
  Object.values(views).forEach(v => v.classList.add('hidden'));
  views[name].classList.remove('hidden');
  // Highlight the matching nav button.
  document.querySelectorAll('.nav-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.view === name)
  );
}

document.querySelectorAll('.nav-btn').forEach(btn =>
  btn.addEventListener('click', () => {
    const view = btn.dataset.view;
    if (view === 'profile') fillProfileForm();
    showView(view);
  })
);

/* -----------------------------------------------------------
   6. AUTH (login / signup)
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
    users[name] = { password: pass, profile: null, progress: [] };
    DB.saveUsers(users);
    DB.setSession(name);
    enterApp();
  } else {
    if (!users[name]) return showAuthError('No account with that username.');
    if (users[name].password !== pass) return showAuthError('Incorrect password.');
    DB.setSession(name);
    enterApp();
  }
});

function showAuthError(msg) {
  authError.textContent = msg;
  authError.classList.remove('hidden');
}

document.getElementById('logoutBtn').addEventListener('click', () => {
  DB.clearSession();
  document.getElementById('navbar').classList.add('hidden');
  document.getElementById('authForm').reset();
  showView('auth');
});

/* -----------------------------------------------------------
   7. PROFILE FORM
----------------------------------------------------------- */
const profileForm = document.getElementById('profileForm');

function fillProfileForm() {
  const user = DB.current();
  if (!user || !user.profile) return;
  const p = user.profile;
  age.value = p.age; sex.value = p.sex; height.value = p.height;
  weight.value = p.weight; goalWeight.value = p.goalWeight; goal.value = p.goal;
  activity.value = p.activity; trainingDays.value = p.trainingDays;
  equipment.value = p.equipment; document.getElementById('diet').value = p.diet;
}

profileForm.addEventListener('submit', e => {
  e.preventDefault();
  const profile = {
    age: Number(age.value),
    sex: sex.value,
    height: Number(height.value),
    weight: Number(weight.value),
    goalWeight: Number(goalWeight.value),
    goal: goal.value,
    activity: activity.value,
    trainingDays: trainingDays.value,
    equipment: equipment.value,
    diet: document.getElementById('diet').value,
  };
  const user = DB.current();
  user.profile = profile;
  DB.saveCurrent(user);
  renderAll();
  showView('dashboard');
});

/* -----------------------------------------------------------
   8. RENDERING THE DASHBOARD / DIET / WORKOUT
----------------------------------------------------------- */
function renderAll() {
  const user = DB.current();
  if (!user || !user.profile) return;
  const p = user.profile;
  const targets = buildTargets(p);

  // -- Dashboard --
  document.getElementById('dashName').textContent = DB.session();
  const toGo = (p.weight - p.goalWeight).toFixed(1);
  const direction = p.weight > p.goalWeight ? 'to lose' : p.weight < p.goalWeight ? 'to gain' : 'at goal';
  document.getElementById('statGrid').innerHTML = `
    <div class="stat"><div class="num primary">${targets.calories}</div><div class="lbl">Daily calories</div></div>
    <div class="stat"><div class="num">${targets.macros.protein}g</div><div class="lbl">Protein / day</div></div>
    <div class="stat"><div class="num">${targets.bmr}</div><div class="lbl">BMR (at rest)</div></div>
    <div class="stat"><div class="num">${targets.tdee}</div><div class="lbl">Maintenance (TDEE)</div></div>
    <div class="stat"><div class="num">${Math.abs(toGo)}kg</div><div class="lbl">${direction}</div></div>
  `;

  const m = targets.macros;
  const maxG = Math.max(m.protein, m.carbs, m.fat);
  document.getElementById('targetSummary').innerHTML = `
    ${macroBar('Protein', m.protein, maxG, 'protein')}
    ${macroBar('Carbs', m.carbs, maxG, 'carbs')}
    ${macroBar('Fat', m.fat, maxG, 'fat')}
    <p class="hint" style="text-align:left;margin-top:14px;">
      These are starting targets from the Mifflin–St Jeor formula. Adjust after 2–3 weeks
      based on real results in the Progress tab.
    </p>`;

  // -- Diet --
  document.getElementById('dietIntro').textContent =
    `Aim for ~${targets.calories} kcal/day, split across 4 meals. Mix and match the suggested foods.`;
  const meals = buildDietPlan(targets, p.diet);
  document.getElementById('dietPlan').innerHTML = meals.map(meal => `
    <div class="meal">
      <h4>${meal.name}</h4>
      <div class="kcal">~${meal.kcal} kcal</div>
      <ul class="food-list">
        ${meal.foods.map(f => `<li><span>${f}</span></li>`).join('')}
      </ul>
    </div>`).join('');

  // -- Workout --
  const eqLabel = { gym: 'full gym', home: 'home equipment', bodyweight: 'bodyweight only' }[p.equipment];
  document.getElementById('workoutIntro').textContent =
    `${p.trainingDays} days/week · ${eqLabel}. Rest 60–120s between sets. Add weight or reps each week.`;
  const plan = buildWorkoutPlan(p);
  document.getElementById('workoutPlan').innerHTML = plan.map(day => `
    <div class="workout-day">
      <h4>${day.title}</h4>
      <ul class="ex-list">
        ${day.exercises.map(ex => `<li><span>${ex.name}</span><span class="scheme">${ex.scheme}</span></li>`).join('')}
      </ul>
    </div>`).join('');

  renderProgress();
}

function macroBar(name, grams, max, cls) {
  const w = max ? Math.round((grams / max) * 100) : 0;
  return `<div class="macro-row">
    <span class="name">${name}</span>
    <span class="bar"><span class="fill ${cls}" style="width:${w}%"></span></span>
    <span class="val">${grams} g</span>
  </div>`;
}

/* -----------------------------------------------------------
   9. PROGRESS TRACKING (log + table + chart)
----------------------------------------------------------- */
const progressForm = document.getElementById('progressForm');

progressForm.addEventListener('submit', e => {
  e.preventDefault();
  const date = document.getElementById('logDate').value;
  const w = Number(document.getElementById('logWeight').value);
  if (!date || !w) return;

  const user = DB.current();
  // Replace an entry if the same date is logged twice, else add.
  const existing = user.progress.find(en => en.date === date);
  if (existing) existing.weight = w;
  else user.progress.push({ date, weight: w });
  user.progress.sort((a, b) => a.date.localeCompare(b.date));
  DB.saveCurrent(user);

  progressForm.reset();
  renderProgress();
});

function renderProgress() {
  const user = DB.current();
  const entries = user.progress || [];
  const tbody = document.querySelector('#progressTable tbody');
  const empty = document.getElementById('progressEmpty');

  // Table (newest first), with change vs the previous entry.
  tbody.innerHTML = entries.slice().reverse().map((en, i, arr) => {
    const prev = arr[i + 1]; // older entry
    let change = '';
    if (prev) {
      const diff = (en.weight - prev.weight).toFixed(1);
      const cls = diff > 0 ? 'up' : diff < 0 ? 'down' : '';
      const sign = diff > 0 ? '+' : '';
      change = `<span class="${cls}">${sign}${diff} kg</span>`;
    }
    return `<tr>
      <td>${en.date}</td>
      <td>${en.weight} kg</td>
      <td>${change}</td>
      <td><button class="del-btn" data-date="${en.date}" title="Delete">✕</button></td>
    </tr>`;
  }).join('');

  // Wire up delete buttons.
  tbody.querySelectorAll('.del-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      const u = DB.current();
      u.progress = u.progress.filter(en => en.date !== btn.dataset.date);
      DB.saveCurrent(u);
      renderProgress();
    })
  );

  empty.classList.toggle('hidden', entries.length > 0);
  drawChart(entries, user.profile ? user.profile.goalWeight : null);
}

/* A small hand-drawn line chart on a <canvas> — no libraries.
   Plots weight over time with a dashed goal line. */
function drawChart(entries, goalWeight) {
  const canvas = document.getElementById('progressChart');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const pad = 40;
  ctx.clearRect(0, 0, W, H);

  if (entries.length === 0) return;

  // Figure out the value range (include the goal line in it).
  const weights = entries.map(e => e.weight);
  if (goalWeight) weights.push(goalWeight);
  let min = Math.min(...weights), max = Math.max(...weights);
  if (min === max) { min -= 1; max += 1; }      // avoid divide-by-zero
  const pad10 = (max - min) * 0.1;
  min -= pad10; max += pad10;

  const x = i => pad + (i / Math.max(entries.length - 1, 1)) * (W - pad * 2);
  const y = v => H - pad - ((v - min) / (max - min)) * (H - pad * 2);

  // Horizontal grid lines + labels.
  ctx.strokeStyle = '#2c3360'; ctx.fillStyle = '#9aa3c7';
  ctx.font = '12px system-ui'; ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const val = max - (g / 4) * (max - min);
    const gy = pad + (g / 4) * (H - pad * 2);
    ctx.beginPath(); ctx.moveTo(pad, gy); ctx.lineTo(W - pad, gy); ctx.stroke();
    ctx.fillText(val.toFixed(1), 4, gy + 4);
  }

  // Dashed goal line.
  if (goalWeight) {
    ctx.save();
    ctx.setLineDash([6, 6]); ctx.strokeStyle = '#28d39f';
    ctx.beginPath(); ctx.moveTo(pad, y(goalWeight)); ctx.lineTo(W - pad, y(goalWeight)); ctx.stroke();
    ctx.fillStyle = '#28d39f';
    ctx.fillText('Goal', W - pad - 34, y(goalWeight) - 6);
    ctx.restore();
  }

  // The weight line.
  ctx.strokeStyle = '#5b6cff'; ctx.lineWidth = 2.5; ctx.beginPath();
  entries.forEach((e, i) => i === 0 ? ctx.moveTo(x(i), y(e.weight)) : ctx.lineTo(x(i), y(e.weight)));
  ctx.stroke();

  // Dots on each data point.
  ctx.fillStyle = '#8a5bff';
  entries.forEach((e, i) => {
    ctx.beginPath(); ctx.arc(x(i), y(e.weight), 4, 0, Math.PI * 2); ctx.fill();
  });
}

/* -----------------------------------------------------------
   10. APP STARTUP
----------------------------------------------------------- */
function enterApp() {
  document.getElementById('navbar').classList.remove('hidden');
  const user = DB.current();
  if (user.profile) {            // returning user with a profile
    renderAll();
    showView('dashboard');
  } else {                       // brand-new account → set up profile
    showView('profile');
  }
  // Pre-fill today's date in the progress logger.
  document.getElementById('logDate').value = new Date().toISOString().slice(0, 10);
}

// On page load: if already logged in, jump straight into the app.
(function init() {
  if (DB.session() && DB.current()) enterApp();
  else showView('auth');
})();
