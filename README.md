# 💪 Transform100

A personal fitness website that builds a **diet plan**, a **workout plan**, and
**tracks your progress** toward a goal weight — all from your profile. No internet,
no accounts on a server, no installation. Everything runs in your browser.

## How to use it

**Just double-click `index.html`.** It opens in your browser and works immediately.

1. **Sign up** with any username + password (stored only in *your* browser).
2. Fill in your **profile** (age, height, weight, goal, training days, etc.).
3. Get your **calorie + macro targets**, a **meal plan**, and a **workout split**.
4. Use the **Progress** tab to log your weight and watch the trend line.

> Your data lives in this browser's *local storage*. If you clear your browser
> data, or open the site in a different browser/computer, your account won't be
> there. That's expected for this first version.

## The files

| File          | What it does                                                        |
|---------------|---------------------------------------------------------------------|
| `index.html`  | The page structure (all the screens).                               |
| `styles.css`  | The look & colors. Change the variables at the top to re-theme.     |
| `app.js`      | All the logic: accounts, fitness formulas, plans, progress chart.   |
| `serve.ps1`   | Optional local web server for previewing. Not needed — safe to delete. |

## The fitness math (rule-based)

- **BMR** — Mifflin–St Jeor equation (calories burned at rest).
- **TDEE** — BMR × activity level (your maintenance calories).
- **Target** — lose fat: −500 kcal · maintain: TDEE · build muscle: +300 kcal.
- **Macros** — protein set per kg of bodyweight, fat ≈ 25% of calories, carbs fill the rest.

## Ideas for the next version

- A **meal log** to check calories eaten vs. your target each day.
- Mark **workouts as completed** and track a streak.
- Charts for **body measurements** (waist, arms), not just weight.
- A real **backend + login** so your data syncs across devices.
- Export your plan to **PDF**.

---
*Built as a learning project. The "accounts" here are local-only and not secure —
fine for personal use, but don't reuse a real password.*
