const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { Pool } = require("pg");
const port = process.env.PORT || 5000;

// PostgreSQL pool setup
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: process.env.DB_PORT,
});

// Middleware
app.use(cors());
app.use(express.json());

// Middleware to verify token
const verifyToken = (req, res, next) => {
  if (!req.headers?.authorization) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  const token = req.headers.authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "Unauthorized access" });
    }
    req.decoded = decoded;
    next();
  });
};

// Middleware to provide database connection
app.use(async (req, res, next) => {
  const client = await pool.connect();
  req.dbClient = client;
  try {
    await client.query("SELECT NOW()"); // Dummy query to test connection
    console.log("Database connected successfully");
    next();
  } catch (err) {
    console.error("Database connection failed:", err);
    res.status(500).send({ message: "Internal server error" });
  }
});

// Confirm server is running
app.get("/", (req, res) => {
  res.send("DND Task Management is running...");
});

// Routes

// Generate JWT
app.post("/jwt", async (req, res) => {
  try {
    const user = req.body;

    // Ensure the payload is present
    if (!user || !user.email) {
      return res
        .status(400)
        .send({ message: "Email is required to generate JWT" });
    }

    // Generate JWT
    const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
      expiresIn: "1h",
    });

    res.send({ token });
  } catch (error) {
    console.error("JWT generation error:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

// Get users
app.get("/users", async (req, res) => {
  const client = req.dbClient;
  try {
    const getUsersQuery = "SELECT * FROM users";
    const getUsersResult = await client.query(getUsersQuery);

    if (getUsersResult.rows.length === 0) {
      return res.status(404).send({ message: "No users found" });
    }

    res.send(getUsersResult.rows);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).send({ message: "Internal server error" });
  } finally {
    client.release();
  }
});

// Add task

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).send({ message: "Internal server error" });
});

// Start the server and test the database connection
const startServer = async () => {
  try {
    // Check database connection
    const client = await pool.connect();
    await client.query("SELECT NOW()");
    console.log("Database connected successfully");
    client.release();

    // Start the server
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  } catch (err) {
    console.error("Database connection failed:", err);
    process.exit(1); // Exit the process with an error
  }
};

startServer();
