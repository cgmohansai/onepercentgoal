# <img src="https://i.postimg.cc/LsynVbcs/p1-removebg-preview.png" alt="OnePercentGoal Logo" width="32" /> OnePercentGoal

**A new way to set goals, complete pending tasks, and grow through 1% sprints.**

OnePercentGoal is a first-of-its-kind, sprint-based productivity platform that divides an entire year into 100 checkpoints, where each checkpoint represents 1% of your year. Instead of overwhelming yearly resolutions and endless to-do lists, you focus on small, achievable sprints that help you consistently move toward your goals.

Plan your tasks, track your progress, and review your achievements one percent at a time. You can also write blogs about your journey, document your learnings, and share your public profile with others to showcase your progress and inspire accountability.

This is the first version (v1) of OnePercentGoal—an experiment in rethinking how goals are created and achieved. It's a new concept designed for people who want to try a different approach to productivity and personal growth.

**Start small. Improve by 1%. Build momentum.**

For local development, install the backend dependencies once with `./.venv/bin/python -m pip install -r backend/requirements.txt`, then run `npm run backend` and `npm run dev`. The backend command uses the project virtual environment so GIS token verification is available.

## Google sign-in setup

The app uses Google Identity Services (GIS) for the website and the Android system browser. Copy `.env.example` to `.env`, then set `VITE_APP_URL` and `FRONTEND_URL` to the deployed website URL. Use the same Google OAuth **Web application** client ID for `VITE_GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_ID`. Website API requests are same-origin through the Vercel `/api` rewrite; set `VITE_API_BASE_URL` to the deployed API only when building the Android app.

In Google Cloud Console, add the local and production website addresses under **Authorized JavaScript origins**. The Android app returns through `com.onepercentgoal.app://auth`, which is already registered in the Android manifest; its browser sign-in must therefore open the same deployed website origin configured as `VITE_APP_URL`.

For the current production domains, set these exact values:

- Vercel: `VITE_APP_URL=https://onepercentgoal.vercel.app` and `VITE_GOOGLE_CLIENT_ID=420117390479-kjelftir7nr413rh3b7c9327ia27c6o2.apps.googleusercontent.com`
- Render: `FRONTEND_URL=https://onepercentgoal.vercel.app` and `GOOGLE_CLIENT_ID=420117390479-kjelftir7nr413rh3b7c9327ia27c6o2.apps.googleusercontent.com`

Set `DATABASE_URL` on Render as before. Do not set `VITE_API_BASE_URL` on Vercel; browser API calls use the `/api` rewrite. After changing a Vercel `VITE_*` variable, redeploy Vercel because Vite embeds these values during the build.

Before building the Android APK, create `.env.production` from `.env.production.example`, then run `npm run android:sync` and rebuild the APK. This packages the Vercel website URL and Render API URL into the app instead of `localhost`.
