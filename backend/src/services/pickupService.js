const { calculateSecureFare } = require("smartmap-pro/server");
const { checkOperationalZone } = require("../config/operationalZones");
const {
  WORKSHOPS,
  getActiveWorkshops,
  findNearestWorkshop,
} = require("../config/workshops");

// Default fallback workshop (Colombo Main Workshop)
const WORKSHOP_COORDS = WORKSHOPS[0].coordinates;
const WORKSHOP_ADDRESS = WORKSHOPS[0].address;

// Business rates per vehicle type (Private server-side configuration)
const PICKUP_RATES = {
  vehicles: {
    car: { baseFare: 300, costPerKm: 120, baseDistanceKm: 2 },
    suv: { baseFare: 400, costPerKm: 150, baseDistanceKm: 2 },
    van: { baseFare: 400, costPerKm: 150, baseDistanceKm: 2 },
    jeep: { baseFare: 450, costPerKm: 160, baseDistanceKm: 2 },
    "crew cab": { baseFare: 450, costPerKm: 160, baseDistanceKm: 2 },
    other: { baseFare: 350, costPerKm: 130, baseDistanceKm: 2 },
  },
};

/**
 * Validates if coordinates are in an allowed operational zone (Western Province).
 * Throws a friendly error if outside service area.
 */
function validatePickupZone(coordinates) {
  const check = checkOperationalZone(coordinates);
  if (!check.allowed) {
    const zonesStr = check.activeZones.join(", ");
    const error = new Error(
      `Pickup & delivery is currently only available within ${zonesStr} (Colombo, Gampaha, Kalutara).`,
    );
    error.statusCode = 400;
    throw error;
  }
  return check;
}

/**
 * Calculates secure pickup fare from the nearest active workshop after checking geo-fencing.
 */
async function calculateSecurePickupFare(endCoords, vehicleType = "car") {
  // 1. Enforce Geo-fencing (Western Province check)
  validatePickupZone(endCoords);

  // 2. Automatically select the nearest active workshop
  const nearestWorkshop = findNearestWorkshop(endCoords);

  // 3. Normalize vehicle type
  const normalizedType = (vehicleType || "car").toLowerCase();
  const selectedType = PICKUP_RATES.vehicles[normalizedType]
    ? normalizedType
    : "car";

  // 4. Compute distance and fare from the nearest workshop via routing server
  const { totalCost, distanceKm } = await calculateSecureFare({
    startCoords: nearestWorkshop.coordinates,
    endCoords,
    vehicleType: selectedType,
    rates: PICKUP_RATES,
    osrmUrl:
      process.env.OSRM_URL ||
      "https://router.project-osrm.org/route/v1/driving",
  });

  return {
    pickupCharge: Math.round(totalCost),
    distanceKm: Number(distanceKm.toFixed(2)),
    workshop: nearestWorkshop,
  };
}

module.exports = {
  WORKSHOP_COORDS,
  WORKSHOP_ADDRESS,
  PICKUP_RATES,
  getActiveWorkshops,
  findNearestWorkshop,
  validatePickupZone,
  calculateSecurePickupFare,
};
