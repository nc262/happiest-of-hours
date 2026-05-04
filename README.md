# Happiest of Hours 🍻

AI-powered happy hour finder — discover the best happy hour deals near you, personalised by your preferences.

## Features

- **AI-Powered Search** — Uses GPT-4o-mini to find and rank happy hour venues based on your preferences
- **Real-Time Venue Lookup** — Optionally integrates with the Google Places API to find real nearby bars and restaurants
- **Smart Preferences** — Filter by beer, cocktails, wine, food, kid-friendly, sports bar, outdoor seating, and more
- **Geolocation** — Automatically detect your current location with one click
- **Match Scoring** — Every venue gets an AI-generated match score (0–100) explaining why it fits your preferences

## Getting Started

### 1. Clone & Install

```bash
npm install
```

### 2. Configure API Keys

Copy `.env.example` to `.env.local` and fill in your keys:

```bash
cp .env.example .env.local
```

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | ✅ Yes | Powers AI recommendations and venue analysis |
| `GOOGLE_PLACES_API_KEY` | Optional | Enables real-time venue search via Google Places API |

- **OpenAI key**: Get one at [platform.openai.com](https://platform.openai.com/api-keys)
- **Google Places key**: Get one at [Google Cloud Console](https://console.cloud.google.com/apis/library/places-backend.googleapis.com) (enable the "Places API")

> **Note:** Without a Google Places key, the app uses OpenAI's knowledge to suggest realistic venues for your location. This works great for well-known cities!

### 3. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Tech Stack

- [Next.js 15](https://nextjs.org/) (App Router)
- [React 19](https://react.dev/)
- [Tailwind CSS v4](https://tailwindcss.com/)
- [OpenAI SDK](https://github.com/openai/openai-node) (GPT-4o-mini)
- [Google Places API](https://developers.google.com/maps/documentation/places/web-service) (optional)

## Deployment

Deploy to [Vercel](https://vercel.com/) with one click. Add your environment variables in the Vercel project settings.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/nc262/happiest-of-hours)
