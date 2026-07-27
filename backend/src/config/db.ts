import { Sequelize } from "sequelize";
import dotenv from "dotenv";

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is missing from environment variables.");
}

const isProduction =
  process.env.NODE_ENV === "production" ||
  process.env.DATABASE_URL?.includes("neon.tech");

export const sequelize = new Sequelize(process.env.DATABASE_URL!, {
  dialect: "postgres",
  dialectOptions: isProduction
    ? {
        ssl: {
          require: true,
          rejectUnauthorized: false, // Required for Neon
        },
      }
    : {},
  logging: isProduction ? false : (msg) => console.log(msg), // Fixes SEQUELIZE0002 deprecation
});
