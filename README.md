# UX Research Survey

Lightweight static survey and dashboard for moderated usability sessions.

## Files

- `index.html` - survey form for capturing participant responses and moderator notes
- `admin.html` - password-protected dashboard for viewing stored responses
- `styles.css` - shared styling for survey and dashboard
- `app.js` - localStorage persistence, SUS scoring, analysis, and export tools
- `.github/workflows/deploy-pages.yml` - free GitHub Pages deployment workflow

## How to use locally

1. Open `index.html` in a browser.
2. Fill in the survey during or after a moderated session.
3. Submit to store the response in the browser's local storage.
4. Open `admin.html` and enter the password to review results.

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

This is still a static app. Hosting is free, but responses are stored in each browser's local storage, so data is not shared across devices or participants. The dashboard password is also client-side only. For shared research operations, move storage and authentication to a backend service such as Supabase.

## About the summaries

The dashboard includes local automated summaries and theme extraction. They are AI-style synthesis, not model-backed LLM summaries. If you want true AI summaries, connect the app to a real AI API and backend.