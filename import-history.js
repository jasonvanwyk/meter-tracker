const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Historical data from the spreadsheet
const historicalData = [
    { time: '17:10:00', date: '2025-01-12', reading: 1257445, usage: 8043, liters: 804 },
    { time: '06:00:00', date: '2025-02-12', reading: 1259837, usage: 2392, liters: 239 },
    { time: '05:55:00', date: '2025-03-12', reading: 1263727, usage: 3890, liters: 389 },
    { time: '06:00:00', date: '2025-04-12', reading: 1267684, usage: 3957, liters: 395 },
    { time: '06:10:00', date: '2025-05-12', reading: 1271994, usage: 4310, liters: 431 },
    { time: '07:08:00', date: '2025-06-12', reading: 1276999, usage: 5005, liters: 500 },
    { time: '06:54:00', date: '2025-07-12', reading: 1278499, usage: 1500, liters: 150 },
    { time: '06:09:00', date: '2025-08-12', reading: 1281781, usage: 2280, liters: 228 },
    { time: '05:59:00', date: '2025-09-12', reading: 1284288, usage: 2507, liters: 250 },
    { time: '05:51:00', date: '2025-10-12', reading: 1287309, usage: 3021, liters: 302 }
];

// Connect to database
const dbPath = path.join(__dirname, 'water_monitor.db');
const db = new sqlite3.Database(dbPath);

console.log('Importing historical water readings...\n');

// Clear existing readings first (optional - comment out if you want to keep existing)
db.run("DELETE FROM readings", (err) => {
    if (err) {
        console.error('Error clearing existing readings:', err);
    } else {
        console.log('Cleared existing readings (if any)');
    }

    // Import historical data
    const stmt = db.prepare("INSERT INTO readings (reading_value, reading_date, reading_time) VALUES (?, ?, ?)");

    historicalData.forEach((record, index) => {
        // Convert the 7-digit reading from liters to kiloliters
        // The last digit is decimal liters, so divide by 10 to get liters, then by 1000 for kL
        const readingInLiters = record.reading / 10;  // e.g., 1257445 → 125744.5 liters
        const readingInKL = readingInLiters / 1000;   // e.g., 125744.5 → 125.7445 kL

        // Format the date properly (YYYY-MM-DD)
        const dateParts = record.date.split('-');
        const formattedDate = `${dateParts[0]}-${dateParts[2]}-${dateParts[1]}`; // Convert from YYYY-DD-MM to YYYY-MM-DD

        stmt.run(readingInKL, formattedDate, record.time, function(err) {
            if (err) {
                console.error(`Error inserting record ${index + 1}:`, err);
            } else {
                console.log(`✓ Imported reading ${index + 1}: ${readingInKL} kL on ${formattedDate} at ${record.time}`);

                // Calculate and display the usage (for verification)
                if (index > 0) {
                    const prevReadingInLiters = historicalData[index - 1].reading / 10;
                    const currentReadingInLiters = record.reading / 10;
                    const usageInLiters = currentReadingInLiters - prevReadingInLiters;
                    const calculatedUsage = (usageInLiters / 1000).toFixed(3);  // Convert to kL
                    const expectedUsage = (record.usage / 10 / 1000).toFixed(3);  // Convert expected to kL

                    if (calculatedUsage === expectedUsage) {
                        console.log(`  Usage: ${calculatedUsage} kL ✓`);
                    } else {
                        console.log(`  Usage: ${calculatedUsage} kL (expected: ${expectedUsage} kL)`);
                    }
                }
            }
        });
    });

    stmt.finalize(() => {
        console.log('\n✓ Import completed!');
        console.log('You can now view these readings in the app.');
        db.close();
    });
});