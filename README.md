# Pop Feed

A Bluesky Feed Generator that surfaces popular Japanese posts based on repost activity.

## How It Works

1. **Jetstream Subscription**: Monitors real-time repost events from the Bluesky network
2. **Engagement Tracking**: Counts reposts per post in a rolling 1-hour window
3. **Popular Post Discovery**: Periodically fetches details for top-reposted posts
4. **Japanese Filtering**: Saves posts with Japanese language (`ja`) to the feed
5. **Feed API**: Serves the feed via AT Protocol's `getFeedSkeleton` endpoint

## Tech Stack

- **Runtime**: Node.js with TypeScript
- **Database**: PostgreSQL with Drizzle ORM
- **API**: Express.js
- **AT Protocol**: @atproto/api

## Setup

### Prerequisites

- Node.js 20+
- PostgreSQL
- pnpm

### Installation

```bash
pnpm install
```

### Environment Variables

Create a `.env` file:

```env
DATABASE_URL=postgres://user:password@localhost:5432/dbname

# Feed Generator
PORT=3000
FEEDGEN_HOSTNAME=your-domain.com
FEED_RECORD_NAME=pop-feed-v1

# Bluesky credentials for publishing
BLUESKY_HANDLE=your.handle
BLUESKY_PASSWORD=your-app-password
```

### Database Setup

```bash
pnpm db:generate
pnpm db:migrate
```

## Development

```bash
# Run the server (includes Jetstream worker)
pnpm serve

# Run Jetstream worker only
pnpm dev

# Publish feed to Bluesky
pnpm publish

# Reset database
pnpm db:reset

# Open Drizzle Studio
pnpm db:studio
```

## Deployment (Render)

1. Push to GitHub
2. Create a new Blueprint on Render
3. Connect your repository
4. Set environment variables:
   - `FEEDGEN_HOSTNAME`: Your Render URL (e.g., `pop-feed.onrender.com`)
   - `BLUESKY_HANDLE`: Your Bluesky handle
   - `BLUESKY_PASSWORD`: Your Bluesky app password

The `render.yaml` blueprint will create:
- A web service (API + Jetstream worker)
- A PostgreSQL database (starter plan)

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /xrpc/app.bsky.feed.getFeedSkeleton` | Returns feed skeleton |
| `GET /xrpc/app.bsky.feed.describeFeedGenerator` | Returns feed metadata |
| `GET /.well-known/did.json` | DID document for did:web |
| `GET /health` | Health check |

## License

MIT
