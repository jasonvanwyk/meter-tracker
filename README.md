# Water Monitor App

A simple water monitoring application to track daily water usage and costs.

## Features

- **Dashboard**: View total usage, average daily usage, current cost, and projected monthly cost
- **Add Readings**: Capture daily water meter readings with auto-populated date/time
- **History**: View and manage historical readings with date filtering
- **Settings**: Configure billing periods and water/sewage tariff blocks

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

3. Open in browser:
- Local machine: http://localhost:3000
- From iPhone/mobile: http://[YOUR_COMPUTER_IP]:3000

## Finding Your Computer's IP Address

- **Linux**: Run `ip a` and look for your primary network interface (usually starts with `enp`, `eth`, or `wlan`)
- **Docker/VM**: The server will automatically detect and display the correct IP when started
- **Mac**: Run `ipconfig getifaddr en0` in terminal
- **Windows**: Run `ipconfig` and look for IPv4 Address

Note: If running in a Docker container or VM, make sure to use the host machine's network IP (not docker bridge IPs like 172.x.x.x)

## Usage

1. **First Time Setup**:
   - Go to Settings tab
   - Configure your billing period (start and end days)
   - Set your water and sewage tariff rates

2. **Daily Usage**:
   - Go to "Add Reading" tab
   - Enter your water meter reading
   - Date and time are auto-filled but can be changed
   - Save the reading

3. **View Statistics**:
   - Dashboard shows current billing period statistics
   - Displays daily usage, costs, and projections
   - Updates automatically after adding readings

4. **View History**:
   - History tab shows all readings
   - Filter by date range
   - Delete incorrect readings if needed

## Mobile Access

The app is mobile-friendly and can be accessed from any device on your local network. Make sure your phone and computer are on the same WiFi network.

## Data Storage

All data is stored locally in `water_monitor.db` (SQLite database) in your project directory.