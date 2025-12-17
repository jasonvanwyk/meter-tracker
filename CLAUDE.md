# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build and Run Commands

```bash
npm install          # Install dependencies
npm start            # Start the Express server on port 3000
```

The app is accessible at `http://localhost:3000` or via network IP for mobile devices.

## Environment Variables

Copy `.env.example` to `.env` and set:
- `JWT_SECRET` - Required for production (generate with `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`)
- `PORT` - Server port (default: 3000)

## Architecture

Multi-user water monitoring application with JWT authentication.

### Backend Structure
```
server.js              # Main Express server with protected routes
config/database.js     # SQLite setup and migrations
middleware/auth.js     # JWT verification middleware
routes/auth.js         # Login, register, logout endpoints
```

### API Endpoints
- **Auth (public)**: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- **Protected (require JWT)**: `GET/POST/DELETE /api/readings`, `GET/PUT /api/settings`, `GET /api/statistics`

All protected endpoints filter by authenticated user's ID - users only see their own data.

### Frontend (public/)
- `login.html`, `register.html` - Authentication pages
- `auth.js` - Token storage, API wrapper with auth headers
- `app.js` - Main SPA logic (redirects to login if not authenticated)
- `index.html` - Dashboard, Add Reading, History, Settings tabs

### Data Model
- **users**: `id`, `username`, `password_hash`, `email`, `created_at`, `is_active`
- **readings**: `id`, `user_id`, `reading_value` (kL), `reading_date`, `reading_time`
- **settings**: `id`, `user_id`, `setting_key`, `setting_value` (per-user config)

### Security
- Passwords hashed with bcrypt (12 rounds)
- JWT tokens expire in 7 days
- Rate limiting: 5 auth attempts per 15 min, 100 API requests per 15 min
- Helmet security headers enabled

### Meter Reading Conversion
Raw 7-digit readings (e.g., `1287309`) auto-convert to kiloliters: `÷10 ÷1000` (see `public/app.js:201-205`).

## Deployment

### Production Environment

| Property | Value |
|----------|-------|
| URL | https://meter-tracker.com |
| Internal | http://10.0.70.10:3000 |
| Host | Proxmox `pve` (10.0.1.11) |
| Container | LXC 120 (`water-monitor`) |
| IP | 10.0.70.10 (VLAN 70 - DMZ) |
| OS | Debian 12 |
| Resources | 2 cores, 2GB RAM, 20GB disk |

### Infrastructure

- **Network**: VLAN 70 (DMZ) - isolated from internal networks
- **Access**: Cloudflare Tunnel only (no direct inbound ports)
- **DNS**: Pi-hole (10.0.40.2, 10.0.40.3)
- **Process Manager**: PM2
- **Tunnel**: cloudflared service

### Deployment Commands

```bash
# SSH to container (from management VLAN only)
ssh root@10.0.70.10

# Pull latest code
cd /opt/water-monitor
git pull origin main

# Install dependencies and restart
npm install --production
pm2 restart water-monitor

# View logs
pm2 logs water-monitor

# Check tunnel status
systemctl status cloudflared
```

### Firewall Rules

Container allows:
- Outbound TCP 443 (Cloudflare tunnel)
- Outbound TCP 80 (apt updates)
- Outbound UDP 53 to 10.0.40.2/3 (DNS)
- Inbound TCP 22 from 10.0.1.0/24 (SSH from management)
