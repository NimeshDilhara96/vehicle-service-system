const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const mongoose = require("mongoose");
const User = require("./src/models/User");
const Driver = require("./src/models/Driver");

async function seedUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB for seeding...");

    const testUsers = [
      {
        name: "Test User",
        email: "user@test.com",
        password: "Password123!",
        contactNo: "0771111111",
        role: "Customer",
      },
      {
        name: "Test Admin",
        email: "admin@test.com",
        password: "Password123!",
        contactNo: "0772222222",
        role: "Admin",
      },
      {
        name: "Test Driver",
        email: "driver@test.com",
        password: "Password123!",
        contactNo: "0773333333",
        role: "Driver",
        licenseNo: "B1234567",
      },
      {
        name: "Test Mechanic",
        email: "mechanic@test.com",
        password: "Password123!",
        contactNo: "0774444444",
        role: "Mechanic",
      },
    ];

    for (const u of testUsers) {
      let userDoc = await User.findOne({ email: u.email });
      if (userDoc) {
        userDoc.name = u.name;
        userDoc.password = u.password;
        userDoc.contactNo = u.contactNo;
        userDoc.role = u.role;
        userDoc.isActive = true;
        userDoc.failedLoginAttempts = 0;
        userDoc.lockUntil = undefined;
        await userDoc.save();
        console.log(`Updated ${u.role}: ${u.email}`);
      } else {
        userDoc = await User.create(u);
        console.log(`Created ${u.role}: ${u.email}`);
      }

      // Ensure Driver profile exists in Driver collection when role is Driver
      if (u.role === "Driver") {
        const existingDriver = await Driver.findOne({
          $or: [{ userId: userDoc._id }, { contactNo: u.contactNo }],
        });

        if (existingDriver) {
          existingDriver.userId = userDoc._id;
          existingDriver.name = u.name;
          existingDriver.contactNo = u.contactNo;
          existingDriver.licenseNo = u.licenseNo || existingDriver.licenseNo;
          existingDriver.isDeleted = false;
          existingDriver.deletedAt = null;
          await existingDriver.save();
          console.log(`Synced Driver profile for: ${u.name}`);
        } else {
          await Driver.create({
            userId: userDoc._id,
            name: u.name,
            contactNo: u.contactNo,
            licenseNo: u.licenseNo || "B1234567",
            photograph: "",
            isAvailable: true,
          });
          console.log(`Created Driver profile for: ${u.name}`);
        }
      }
    }

    console.log("Seeding completed successfully.");
    process.exit(0);
  } catch (err) {
    console.error("Seed error:", err);
    process.exit(1);
  }
}

seedUsers();
