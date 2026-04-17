# Meeting Scheduler

A scheduling tool for collecting participant availability across Canadian time zones.

## What this is

- Admin signs in (email + password) to create and manage meeting polls
- Admin shares a unique link per poll; participants open the link without signing in
- Participants pick 30-minute slots across the dates the admin chose
- Admin sees a heatmap of everyone's availability
- All data lives in Supabase (Canadian-region Postgres database)

## Environment variables

This app needs two environment variables to run:

- `VITE_SUPABASE_URL` — your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — your Supabase anon public key

For local development, copy `.env.example` to `.env` and fill in the values.
For Vercel deployment, add them in Project Settings → Environment Variables.

## Running locally (optional)

```
npm install
npm run dev
```

Then open http://localhost:5173

## Database schema

The SQL to set up the `polls` and `responses` tables, plus Row Level Security policies, is documented in the deployment guide provided with this project.

## Admin accounts

Admin users are created in Supabase's Authentication panel. Any user in the
Supabase auth system can sign in as an admin.
