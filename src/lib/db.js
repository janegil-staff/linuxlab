// src/lib/db.js
// Mongoose connection. MONGODB_URI from env (Atlas or local).
import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";

export async function connectDb() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set");
  }
  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
  });
  console.log("[db] connected");
  return mongoose.connection;
}
