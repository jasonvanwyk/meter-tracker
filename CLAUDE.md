# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Run Commands

```bash
npm install          # Install dependencies
npm start            # Start the Express server on port 3000
```

The app is accessible at `http://localhost:3000` or via network IP for mobile devices.

## Utility Scripts

```bash
node import-history.js    # Import historical readings from docs/history.txt (clears existing data)
```

## Architecture

This is a single-page water monitoring application with an Express backend and vanilla JavaScript frontend.

### Backend (server.js)
- Express server with SQLite database (`water_monitor.db`)
- REST API endpoints:
  - `GET/POST/DELETE /api/readings` - CRUD for water meter readings
  - `GET/PUT /api/settings` - Configuration for billing periods and tariff rates
  - `GET /api/statistics` - Dashboard data with cost calculations for current billing period

### Frontend (public/)
- `index.html` - Single page with tab navigation (Dashboard, Add Reading, History, Settings)
- `app.js` - Client-side logic for all tabs and API communication
- `styles.css` - Mobile-friendly styling

### Data Model
- **readings**: `id`, `reading_value` (kL), `reading_date`, `reading_time`, `created_at`
- **settings**: Key-value store for billing configuration and tiered water/sewage tariff blocks

### Cost Calculation
The app uses tiered pricing blocks for both water and sewage, configured in settings. Cost is calculated progressively through usage tiers (e.g., first 6kL at one rate, next 9kL at another rate, etc.).

### Meter Reading Conversion
Raw meter readings entered as large numbers (e.g., `1287309`) are automatically converted to kiloliters: divided by 10 to get liters, then by 1000 for kL (see `public/app.js:176-182`).
