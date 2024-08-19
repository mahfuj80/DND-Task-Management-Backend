const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { Pool } = require("pg");
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

// PostgreSQL pool setup
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: process.env.DB_PORT,
});

// Route to generate JWT
app.post("/jwt", async (req, res) => {
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
});

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

// Confirm server is running
app.get("/", (req, res) => {
  res.send("DND Task Management is running...");
});

// Post users


app.post("/users", async (req, res) => {
  const client = await pool.connect();
  try {
    const user = req.body;
    const email = user?.email;

    if (!email) {
      return res
        .status(400)
        .send({ message: "Email is required", insertedId: null });
    }

    // Check if user already exists
    const checkUserQuery = "SELECT * FROM users WHERE email = $1";
    const checkUserResult = await client.query(checkUserQuery, [email]);

    if (checkUserResult.rows.length > 0) {
      return res.send({ message: "User already exists", insertedId: null });
    }

    // Insert new user
    const insertUserQuery =
      "INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id";
    const insertUserValues = [user.name, user.email, user.password];
    const insertUserResult = await client.query(
      insertUserQuery,
      insertUserValues
    );

    res.send({
      message: "User inserted",
      insertedId: insertUserResult.rows[0].id,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "An error occurred", error });
  } finally {
    client.release();
  }
});

// Start the server
app.listen(port, () => {
  console.log(`DND Task Management is sitting on port ${port}`);
});
