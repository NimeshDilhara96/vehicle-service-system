require("dotenv").config();
const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../src/app");
const User = require("../src/models/User");

// Connect to a test database or existing local Mongo before tests run
beforeAll(async () => {
  const mongoUri =
    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/vehicle_service_test";
  await mongoose.connect(mongoUri);
});

// Clean up database after each test
afterEach(async () => {
  await User.deleteMany();
});

// Close DB connection after all tests finish
afterAll(async () => {
  await mongoose.connection.close();
});

describe("Authentication & Security Suite", () => {
  test("1. Should register a user and set HttpOnly cookie", async () => {
    const res = await request(app).post("/api/auth/register").send({
      name: "John Doe",
      email: "john@example.com",
      password: "Password123!",
      contactNo: "0771234567",
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.user).not.toHaveProperty("password"); // Verify password hash is never leaked

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
      contactNo: "0779876543",
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toMatch(/already registered/i);
  });

  test("3. Negative Test: Reject login with incorrect password", async () => {
    await request(app).post("/api/auth/register").send({
      name: "Mark Perera",
      email: "mark@example.com",
      password: "CorrectPassword123!",
      contactNo: "0712345678",
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
});
