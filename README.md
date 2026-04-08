# UX Research Survey

Lightweight static survey and dashboard for moderated usability sessions.

## Files

- `index.html` - survey form for capturing participant responses and moderator notes
- `admin.html` - password-protected dashboard for viewing stored responses
- `styles.css` - shared styling for survey and dashboard
- `app.js` - localStorage persistence, SUS scoring, analysis, and export tools
- `config.js` - deployment-level storage settings for local mode or Supabase
- `supabase/schema.sql` - SQL schema and policies for shared response storage
- `.github/workflows/deploy-pages.yml` - free GitHub Pages deployment workflow

## How to use locally

1. Open `index.html` in a browser.
2. Fill in the survey during or after a moderated session.
3. Submit to store the response in the browser's local storage.
4. Open `admin.html` and enter the password to review results.

If `config.js` contains a Supabase URL and anon key, submissions are stored in Supabase instead and become visible across devices.

## Dashboard password

- Default password: `woolens`

## Exports and analytics

- JSON export for full raw responses
- CSV export for spreadsheet analysis
- SUS average by question
- Background knowledge versus SUS scatter plot
- Background comfort distribution
- SUS distribution bands
- Automated pains, gains, and overall summaries
- Task-level observation themes
- Candidate-by-candidate response overview

## Free hosting with GitHub Pages

1. Create a GitHub repository and push this folder to the `main` branch.
2. In GitHub, open repository settings, then `Pages`.
3. Set the source to `GitHub Actions`.
4. Push to `main` again if needed. The workflow in `.github/workflows/deploy-pages.yml` will publish the site for free.

## Important limitation

This is still a static app. If `config.js` is left empty, responses are stored in each browser's local storage, so data is not shared across devices or participants. If you configure Supabase, submissions are shared across devices, but the dashboard password is still client-side only. For real admin security, move authentication and privileged actions to a backend service.

## Shared storage setup with Supabase

1. Create a Supabase project.
2. In the Supabase SQL editor, run the script in `supabase/schema.sql`.
3. In Supabase, open `Project Settings`, then `API`, and copy:
	 - Project URL
	 - Project API anon key or publishable key
4. For local testing, open `config.js` and set:

```js
window.uxResearchConfig = {
	supabaseUrl: "https://YOUR-PROJECT.supabase.co",
	supabasePublishableKey: "YOUR-PUBLISHABLE-OR-ANON-KEY"
};
```

5. Redeploy to GitHub Pages.

Once those values are in place, the survey saves to Supabase and the dashboard reads the shared dataset.

## Recommended GitHub Pages setup

If you deploy with GitHub Pages, do not rely on a manually edited checked-in `config.js`. The Pages workflow can build `config.js` from repository secrets so the deployed site keeps using shared Supabase storage.

1. In GitHub, open repository `Settings`, then `Secrets and variables`, then `Actions`.
2. Add these repository secrets:
	 - `UX_RESEARCH_SUPABASE_URL`
	 - `UX_RESEARCH_SUPABASE_ANON_KEY`
3. Redeploy the site.

If those secrets are present, the workflow overwrites `config.js` during deployment with the correct Supabase values. You can store either the anon key or the publishable key in `UX_RESEARCH_SUPABASE_ANON_KEY`; this app accepts both. If they are missing, the site falls back to whatever is committed in `config.js`, which means local-only mode if that file is blank.

## Security note

Because this site is fully static, any browser that loads it also receives the Supabase anon key. That is normal for client-side apps, but it means the current dashboard password should be treated as convenience only, not real access control. If you need protected admin actions, add Supabase Auth or a server/API layer.

## About the summaries

The dashboard includes local automated summaries and theme extraction. They are AI-style synthesis, not model-backed LLM summaries. If you want true AI summaries, connect the app to a real AI API and backend.