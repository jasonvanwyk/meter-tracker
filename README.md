# Water Monitor

A multi-user water consumption tracking and billing application. Monitor daily usage, calculate costs based on tiered tariffs, and project monthly expenses.

**Production:** https://meter-tracker.com

## Current Status: Phase 1 (Manual Metering)

This is Phase 1 of a larger smart metering project. Currently supports manual meter reading entry with automatic cost calculation.

## Features

### User Management
- Multi-user authentication with JWT tokens
- Secure password hashing (bcrypt)
- Password reset via email (SMTP2GO)
- Per-user data isolation

### Dashboard
- Current billing period usage totals
- Average daily consumption
- Current and projected monthly costs
- Cost breakdown (water basic charge, usage tiers, sewage)
- Daily usage history

### Meter Readings
- Manual meter reading entry
- Automatic conversion from 7-digit meter readings to kiloliters
- Date/time stamping
- Historical reading management

### Billing & Tariffs
- Configurable billing periods
- 5-tier water tariff blocks
- 4-tier sewage tariff blocks
- Real-time cost calculations

### Security
- JWT authentication (7-day expiry)
- Bcrypt password hashing (12 rounds)
- Rate limiting (100 API requests/15min, 5 auth attempts/15min)
- Helmet security headers
- Password reset tokens (SHA-256 hashed, 1-hour expiry, single-use)

## Installation

### Development

```bash
# Install dependencies
npm install

# Copy environment file and configure
cp .env.example .env

# Start development server
npm start
```

Access at http://localhost:3000

### Production Deployment

See [CLAUDE.md](CLAUDE.md) for detailed deployment instructions.

## Configuration

### Environment Variables

```env
# Required
JWT_SECRET=your-secret-key

# Optional
PORT=3000

# Email (for password reset)
SMTP_HOST=mail.smtp2go.com
SMTP_PORT=2525
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
SMTP_FROM=noreply@yourdomain.com
APP_URL=https://yourdomain.com
```

Generate a secure JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## Usage

1. **Register/Login** - Create an account or sign in
2. **Settings** - Configure billing period and tariff rates
3. **Add Readings** - Enter daily meter readings
4. **Dashboard** - View usage statistics and cost projections
5. **History** - Review and manage past readings

## Tech Stack

- **Backend:** Node.js, Express 5.x
- **Database:** SQLite
- **Auth:** JWT, bcrypt
- **Email:** Nodemailer (SMTP2GO)
- **Frontend:** Vanilla JavaScript, CSS

## Project Roadmap

### Phase 1: Manual Metering (Current)
- [x] Multi-user authentication
- [x] Manual meter reading entry
- [x] Tiered tariff calculations
- [x] Usage statistics and projections
- [x] Password reset via email

### Phase 2: Smart Water Metering
- [ ] Hardware integration (flow meters with IoT connectivity)
- [ ] Automatic reading capture and recording
- [ ] Real-time flow rate monitoring
- [ ] Leak detection based on:
  - Exceeding user-set thresholds (hourly/daily/weekly/monthly)
  - Deviation from average usage patterns
  - Configurable percentage-based alerts
- [ ] Automatic water valve shut-off
- [ ] Multiple meters per user (main, irrigation, pool, etc.)
- [ ] Push notifications and alerts

### Phase 3: Electricity Monitoring
- [ ] Electricity meter integration
- [ ] kWh consumption tracking
- [ ] Tiered electricity tariff support
- [ ] Combined utility dashboard
- [ ] Time-of-use rate calculations

## License

Private project.

## Contributing

This is a private project. For issues or feature requests, contact the maintainer.
