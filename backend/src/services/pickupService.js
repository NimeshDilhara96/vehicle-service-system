const { checkOperationalZone } = require("../config/operationalZones");
const {
  WORKSHOPS,
  getActiveWorkshops,
  findNearestWorkshop,
} = require("../config/workshops");

/**
 * Fetches exact road distance from OSRM routing server and computes fare
 * based on server-side vehicle pricing configuration.
 */
async function calculateSecureFare({
  startCoords,
  endCoords,
  vehicleType,
  rates,
  osrmUrl,
}) {
  const activeOsrmUrl =
    osrmUrl || "https://router.project-osrm.org/route/v1/driving";
  const fetchUrl = `${activeOsrmUrl}/${startCoords[1]},${startCoords[0]};${endCoords[1]},${endCoords[0]}?overview=false`;

  let distanceKm = 0;
  try {
    const response = await fetch(fetchUrl, {
      signal: AbortSignal.timeout(8000),
    });
    const data = await response.json();

    if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
      throw new Error("Routing server failed to return a valid route.");
    }

    distanceKm = data.routes[0].distance / 1000;
  } catch (err) {
    throw new Error(`Failed to calculate secure distance: ${err.message}`);
  }

  const vehicleConfig = rates.vehicles?.[vehicleType];
  if (!vehicleConfig) {
    throw new Error(`Invalid vehicle type: ${vehicleType}`);
  }

  const { baseFare, costPerKm, baseDistanceKm = 0 } = vehicleConfig;
  const rounding = rates.system?.distanceRounding || "NONE";

  let billableDistance = Math.max(0, distanceKm - baseDistanceKm);
  if (rounding === "UP") {
    billableDistance = Math.ceil(billableDistance);
  } else if (rounding === "DOWN") {
    billableDistance = Math.floor(billableDistance);
  }

  const totalCost = baseFare + billableDistance * costPerKm;
  return { totalCost, distanceKm };
}

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
  calculateSecureFare,
  calculateSecurePickupFare,
};
