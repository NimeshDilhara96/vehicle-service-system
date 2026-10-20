require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./src/models/User");

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
    ];

    for (const u of testUsers) {
      const existing = await User.findOne({ email: u.email });
      if (existing) {
        existing.name = u.name;
        existing.password = u.password;
        existing.contactNo = u.contactNo;
        existing.role = u.role;
        existing.failedLoginAttempts = 0;
        existing.lockUntil = undefined;
        await existing.save();
        console.log(`Updated ${u.role}: ${u.email}`);
      } else {
        await User.create(u);
        console.log(`Created ${u.role}: ${u.email}`);
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

