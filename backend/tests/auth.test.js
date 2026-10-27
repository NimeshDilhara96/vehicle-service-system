require("dotenv").config({ quiet: true });
const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../src/app");
const User = require("../src/models/User");
const Vehicle = require("../src/models/Vehicle");

// Connect to a test database or existing local Mongo before tests run
beforeAll(async () => {
  const mongoUri =
    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/vehicle_service_test";
  await mongoose.connect(mongoUri, { dbName: "vehicle_service_test" });
  await Vehicle.syncIndexes();
});

// Clean up database after each test
afterEach(async () => {
  await Vehicle.deleteMany();
  await User.deleteMany();
});

// Close DB connection after all tests finish
afterAll(async () => {
  await mongoose.connection.close();
});

describe("Authentication, Vehicle & Security Suite", () => {
  test("1. Should register a user with their first vehicle and set HttpOnly cookie", async () => {
    const res = await request(app).post("/api/auth/register").send({
      name: "John Doe",
      email: "john@example.com",
      password: "Password123!",
      contactNo: "0771234567",
      registrationNo: "cab-1234",
      vehicleType: "Car",
      brand: "Toyota",
      modelName: "Corolla",
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.user).not.toHaveProperty("password"); // Verify password hash is never leaked
    expect(res.body.vehicle).toBeDefined();
    expect(res.body.vehicle.registrationNo).toBe("CAB-1234");
    expect(res.body.vehicle.isDeleted).toBe(false);

    // Checklist Check: Token must be in HttpOnly cookie
    const cookies = res.headers["set-cookie"];
    expect(cookies).toBeDefined();
    expect(cookies[0]).toMatch(/HttpOnly/);
  });

  test("2. Negative Test: Reject registration with duplicate email", async () => {
    await User.create({
      name: "Jane Doe",
      email: "jane@example.com",
      password: "Password123!",
      contactNo: "0779876543",
    });

    const res = await request(app).post("/api/auth/register").send({
      name: "Jane Doe",
      email: "jane@example.com",
      password: "Password123!",
      contactNo: "0771112223",
      registrationNo: "CAB-5678",
      vehicleType: "SUV",
      brand: "Honda",
      modelName: "CR-V",
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/email is already registered/i);
  });

  test("3. Negative Test: Reject login with incorrect password", async () => {
    await request(app).post("/api/auth/register").send({
      name: "Mark Perera",
      email: "mark@example.com",
      password: "CorrectPassword123!",
      contactNo: "0712345678",
      registrationNo: "AB-1234",
      vehicleType: "Car",
      brand: "Nissan",
      modelName: "Sunny",
    });

    const res = await request(app).post("/api/auth/login").send({
      email: "mark@example.com",
      password: "WrongPassword!",
    });

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe("Invalid credentials.");
  });

  test("4. Security Test: Reject payload exceeding 10kb body limit", async () => {
    const largeString = "A".repeat(15 * 1024); // 15KB string payload

    const res = await request(app).post("/api/auth/login").send({
      email: "test@example.com",
      largeData: largeString,
    });

    // Express payload size limit returns 413 Payload Too Large
    expect(res.statusCode).toBe(413);
  });

  test("5. Auth State: Reject access to /api/auth/me without HttpOnly cookie", async () => {
    const res = await request(app).get("/api/auth/me");

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toMatch(/unauthorized/i);
  });

  test("6. Transaction Rollback Test: Roll back User creation if vehicle registrationNo already exists", async () => {
    // First customer registers with CAB-9999
    await request(app).post("/api/auth/register").send({
      name: "First Owner",
      email: "owner1@example.com",
      password: "Password123!",
      contactNo: "0771111111",
      registrationNo: "CAB-9999",
      vehicleType: "Car",
      brand: "Toyota",
      modelName: "Prius",
    });

    // Second customer tries to register with the same vehicle number CAB-9999
    const res = await request(app).post("/api/auth/register").send({
      name: "Second User",
      email: "owner2@example.com",
      password: "Password123!",
      contactNo: "0772222222",
      registrationNo: "CAB-9999",
      vehicleType: "Car",
      brand: "Toyota",
      modelName: "Prius",
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(
      /vehicle with this registration number already exists/i,
    );

    // Verify atomic transaction rolled back the second user creation completely
    const rolledBackUser = await User.findOne({ email: "owner2@example.com" });
    expect(rolledBackUser).toBeNull();
  });

  test("7. Validation Test: Reject invalid mobile number and invalid vehicle registration number formats", async () => {
    // Invalid mobile number format
    const badMobileRes = await request(app).post("/api/auth/register").send({
      name: "Test User",
      email: "badmobile@example.com",
      password: "Password123!",
      contactNo: "0112345",
      registrationNo: "CAB-1111",
      vehicleType: "Car",
      brand: "Suzuki",
      modelName: "Alto",
    });
    expect(badMobileRes.statusCode).toBe(400);
    expect(badMobileRes.body.message).toMatch(/invalid mobile number format/i);

    // Invalid vehicle plate format
    const badVehicleRes = await request(app).post("/api/auth/register").send({
      name: "Test User",
      email: "badplate@example.com",
      password: "Password123!",
      contactNo: "0773333333",
      registrationNo: "INVALID-PLATE-99999",
      vehicleType: "Car",
      brand: "Suzuki",
      modelName: "Alto",
    });
    expect(badVehicleRes.statusCode).toBe(400);
    expect(badVehicleRes.body.message).toMatch(
      /invalid vehicle registration number format/i,
    );
  });

  test("8. Step 1 Availability Pre-Check: /api/auth/check-availability detects duplicate email or contactNo", async () => {
    await request(app).post("/api/auth/register").send({
      name: "Existing User",
      email: "existing@example.com",
      password: "Password123!",
      contactNo: "0774444444",
      registrationNo: "CAB-4444",
      vehicleType: "Van",
      brand: "Toyota",
      modelName: "Hiace",
    });

    const dupContactRes = await request(app)
      .post("/api/auth/check-availability")
      .send({
        email: "newemail@example.com",
        contactNo: "0774444444",
      });
    expect(dupContactRes.statusCode).toBe(400);
    expect(dupContactRes.body.message).toMatch(
      /contact number is already registered/i,
    );

    const availableRes = await request(app)
      .post("/api/auth/check-availability")
      .send({
        email: "fresh@example.com",
        contactNo: "0775555555",
      });
    expect(availableRes.statusCode).toBe(200);
    expect(availableRes.body.success).toBe(true);
  });

  test("9. Soft Delete & Partial Unique Index: Soft-deleted vehicle preserves audit record and allows re-registration by new owner", async () => {
    // 1. Owner 1 registers vehicle WP CAB-7777
    const regRes = await request(app).post("/api/auth/register").send({
      name: "Seller User",
      email: "seller@example.com",
      password: "Password123!",
      contactNo: "0776666666",
      registrationNo: "WP CAB-7777",
      vehicleType: "SUV",
      brand: "Mitsubishi",
      modelName: "Montero",
    });
    expect(regRes.statusCode).toBe(201);
    const cookie = regRes.headers["set-cookie"];
    const vehicleId = regRes.body.vehicle._id;

    // 2. Owner 1 soft-deletes the vehicle
    const delRes = await request(app)
      .delete(`/api/vehicles/${vehicleId}`)
      .set("Cookie", cookie);
    expect(delRes.statusCode).toBe(200);

    // 3. Verify record still exists in DB with isDeleted: true and deletedAt timestamp
    const softDeletedDoc = await Vehicle.findById(vehicleId);
    expect(softDeletedDoc).not.toBeNull();
    expect(softDeletedDoc.isDeleted).toBe(true);
    expect(softDeletedDoc.deletedAt).not.toBeNull();

    // 4. Verify GET /api/vehicles excludes soft-deleted vehicles
    const listRes = await request(app)
      .get("/api/vehicles")
      .set("Cookie", cookie);
    expect(listRes.statusCode).toBe(200);
    expect(listRes.body.vehicles).toHaveLength(0);

    // 5. New owner registers the same vehicle number WP CAB-7777
    const newOwnerRes = await request(app).post("/api/auth/register").send({
      name: "Buyer User",
      email: "buyer@example.com",
      password: "Password123!",
      contactNo: "0778888888",
      registrationNo: "WP CAB-7777",
      vehicleType: "SUV",
      brand: "Mitsubishi",
      modelName: "Montero",
    });
    expect(newOwnerRes.statusCode).toBe(201);
    expect(newOwnerRes.body.vehicle.registrationNo).toBe("WP CAB-7777");
    expect(newOwnerRes.body.vehicle.isDeleted).toBe(false);
  });
});
