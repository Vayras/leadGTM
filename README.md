

# leadgtm

**leadgtm is an open-source AI GTM engine that runs cold outbound on autopilot.**

Describe your target audience in plain English with optional targeted briefs, and leadgtm discovers leads daily, enriches them with AI, creates tailored email campaigns, and sends via Resend. System on, autopilot on, you sleep.

---

## How it works

1. **You set context** — fill in the Company Profile so the AI can search broadly. Optionally add **Lead Briefs** to pinpoint specific kinds of leads ("acting coaches on TikTok with 10k+ followers").
2. **Choose execution mode per brief**:
  - `Queue`: picked up by scheduled generation/run.
  - `Run now`: generates and starts search immediately.
3. **AI generates search queries** from your context + briefs.
4. **Bright Data runs search and extracts leads** with enrichment hints.
5. **AI enriches leads** (bio, fit score, contact context).
6. **AI creates a draft campaign per lead** for review.
7. **Approve and send** — either you manually review and click "Create and Start Campaign", or **Autopilot** sweeps the backlog daily at 10am ET and sends the top N qualifying leads on its own.
8. **Resend send status is tracked locally**; daily digest summarizes what went out.

### Controls


| Toggle               | What it does                                                                                                                                                                                                                            |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **System ON/OFF**    | Master switch. When OFF, nothing runs. No searches, no enrichment, no campaigns. Turning this off also pauses Autopilot.                                                                                                                |
| **Autopilot ON/OFF** | When ON, every day at 10am ET the top N Ready-to-Add leads (configurable fit-score threshold + daily limit) are auto-added to their suggested campaigns and a digest email is sent summarizing the run. Configure in the Autopilot tab. |


### Daily schedule


| Time        | What happens                                                                          |
| ----------- | ------------------------------------------------------------------------------------- |
| 8:30 AM     | Generate queued search queries from briefs and company context                        |
| 9:00 AM     | Run searches, discover and enrich leads                                               |
| 10:00 AM ET | **Autopilot sweep** — auto-add top N Ready-to-Add leads + digest email (when enabled) |
| Hourly      | Sync campaign status and analytics from local send events                             |
| 2:00 PM ET  | Send daily discovery digest email                                                     |


---

## Features

- **AI lead discovery:** Bright Data SERP results find people matching your natural-language description.
- **AI enrichment:** Bio, social links, audience size, expertise tags, and a 1-10 fit score with reasoning.
- **AI email copywriting:** Personalized multi-step sequences generated per lead draft.
- **Campaign management:** Draft-first campaigns with controlled sending through Resend.
- **System + Autopilot toggles:** Company-level master switch plus a daily Autopilot sweep that auto-adds the top N qualifying leads each morning (configurable daily limit, minimum fit score, and digest email).
- **Fresh-copy Autopilot:** Optional "regenerate draft before adding" — rewrites each draft's sequence against the lead's bio/expertise right before sending so stale templated copy never goes out.
- **Exploration mode:** When no new briefs exist, AI generates creative queries to keep pipeline coverage fresh.
- **Daily digests:** Two summary emails — a per-company Autopilot digest (what was auto-added and to which campaigns) and a global discovery digest (leads found, emails sent, opens, replies).
- **Multi-company:** Manage multiple company profiles from a single dashboard.

## Stack


| Layer           | Technology                                                                          |
| --------------- | ----------------------------------------------------------------------------------- |
| Framework       | [Next.js 15](https://nextjs.org) (App Router)                                       |
| Frontend        | React 19, [Tailwind CSS](https://tailwindcss.com), [Radix UI](https://radix-ui.com) |
| Database        | PostgreSQL via `DATABASE_URL`                                                       |
| Auth            | Local email/password auth backed by PostgreSQL                                      |
| Background Jobs | [Inngest](https://inngest.com)                                                      |
| Lead Discovery  | [Bright Data](https://brightdata.com) SERP API                                      |
| Email Sending   | [Resend](https://resend.com)                                                        |
| AI              | [OpenAI](https://openai.com) (GPT-4.1 / GPT-5-mini)                                 |
| Digest Emails   | [Resend](https://resend.com)                                                        |


---

## Getting Started

### Prerequisites

Accounts needed:

- PostgreSQL on your VPS — database
- [Bright Data](https://brightdata.com) — lead discovery via SERP API
- [Resend](https://resend.com) — email sending and daily digest emails
- [OpenAI](https://platform.openai.com) — AI enrichment and generation
- [Inngest](https://inngest.com) — background job scheduling

Locally: Node.js 18+ and npm.

### Setup

```bash
# Clone and install
git clone https://github.com/your-org/leadgtm.git
cd leadgtm
npm install

# Configure environment
cp apps/autogtm/.env.example apps/autogtm/.env.local
# Fill in values in .env.local

# Run
npm run dev
```

The app runs at [http://localhost:3200](http://localhost:3200).

For background jobs, run the Inngest dev server in a separate terminal:

```bash
npx inngest-cli@latest dev
```

### Environment

Set these values in `apps/autogtm/.env.local`:

```bash
DATABASE_URL=postgres://user:password@your-vps-host:5432/leadgtm
POSTGRES_SSL=false

BRIGHT_DATA_API_KEY=your_bright_data_api_key
BRIGHT_DATA_SERP_ZONE=serp_api1
BRIGHT_DATA_COUNTRY=us

RESEND_API_KEY=your_resend_api_key
RESEND_FROM_EMAIL="Your Name <you@yourdomain.com>"
RESEND_DAILY_LIMIT=50

OPENAI_API_KEY=your_openai_api_key
```

### PostgreSQL Setup

Create a database on your VPS, then run:

```bash
psql "$DATABASE_URL" -f schema.sql
```

This creates all required tables, indexes, RLS policies, and helper functions.

If you already have a database from an earlier version, apply incremental migrations from `[migrations/](./migrations/)` instead — they're safe to re-run (`IF NOT EXISTS` guarded).



## Deployment

leadgtm is a standard Next.js app. Deploy to any platform that supports it:

- **Vercel** — recommended, zero-config Next.js deployment

Make sure to:

1. Set all environment variables in your hosting platform
2. Connect your Inngest app to receive webhooks at `/api/inngest`
3. Ensure your VPS firewall allows the deployment host to reach PostgreSQL

## License

Licensed under [AGPL-3.0](LICENSE).

**TL;DR:** You can use it, change it, and ship it; if you run a modified version as a service (e.g. a hosted app), you must make that version’s source code available to your users.
