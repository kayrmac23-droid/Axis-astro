// astro-calc.ts

// Function to calculate Julian Date
function getJulianDate(date: Date): number {
    return (date.getTime() / 86400000) + 2440587.5;
}

// Function to calculate tropical astrology chart
function calculateTropicalChart(date: Date): any {
    // Implementation of tropical astrology calculations
    const jd = getJulianDate(date);
    // Your tropical calculations here
    return {
        jd: jd,
        // other tropical chart data
    };
}

// Function to calculate sidereal astrology chart
function calculateSiderealChart(date: Date): any {
    const jd = getJulianDate(date);
    // Your sidereal calculations here
    return {
        jd: jd,
        // other sidereal chart data
    };
}

// Export functions for use in other modules
export { calculateTropicalChart, calculateSiderealChart };