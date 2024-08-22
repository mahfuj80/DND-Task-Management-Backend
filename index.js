const express = require("express");
const app = express();
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const { Pool } = require("pg");
const port = process.env.PORT || 5000;

// PostgreSQL pool setup
// const pool = new Pool({
//   user: process.env.DB_USER,
//   host: process.env.DB_HOST,
//   database: process.env.DB_NAME,
//   password: process.env.DB_PASS,
//   port: process.env.DB_PORT,
// });

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL,
});

// Middleware
app.use(cors());
app.use(express.json());

// Middleware to verify token
const verifyToken = (req, res, next) => {
  console.log(req.headers?.authorization);

  if (!req.headers?.authorization) {
    return res.status(401).send({ message: "Unauthorized access" });
  }
  const token = req.headers.authorization.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "Unauthorized access" });
    }
    req.decoded = decoded;
    console.log(req.decoded == decoded);
    next();
  });
};

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
app.get("/users", verifyToken, async (req, res) => {
  const client = await pool.connect();
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

// Post A single User
app.post("/users", async (req, res) => {
  const client = await pool.connect();
  const { name, email, image } = req.body;

  const insertUserQuery = `
    INSERT INTO users (name, email, image)
    VALUES ($1, $2, $3)
    RETURNING *;
  `;
  const values = [name, email, image];

  try {
    const insertUserResult = await client.query(insertUserQuery, values);
    res.send({ result: insertUserResult.rows[0], message: "success" });
  } catch (error) {
    console.error("Error adding user:", error);

    if (error.code === "23505") {
      // Handle unique violation error (e.g., if email already exists)
      res.status(200).send({ message: "success" });
    } else {
      res.status(500).send({ message: "Internal server error" });
    }
  } finally {
    client.release();
  }
});

// Add Board
app.post("/categories", verifyToken, async (req, res) => {
  const { id, boardName, uid } = req.body;

  // Check if the required fields are provided
  if (!id || !boardName || !uid) {
    return res
      .status(400)
      .send({ message: "id, boardName, and uid are required" });
  }

  const query = `
    INSERT INTO category (id, boardName, uid)
    VALUES ($1, $2, $3)
    RETURNING *`;
  const values = [id, boardName, uid];

  try {
    const result = await pool.query(query, values);
    res.status(201).send(result.rows[0]);
  } catch (error) {
    console.error("Error adding category:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

// Get Board By uid
app.get("/categories/:uid", verifyToken, async (req, res) => {
  const { uid } = req.params;
  const query = "SELECT * FROM category WHERE uid = $1";

  try {
    const result = await pool.query(query, [uid]);

    if (result.rows.length === 0) {
      return res
        .status(404)
        .send({ message: "No categories found for this UID" });
    }

    res.send(result.rows);
  } catch (error) {
    console.error("Error fetching categories by UID:", error);
    res.status(500).send({ message: "Internal server error" });
  }
});

// Delete Board and All The Task of the board
app.delete("/categories/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    // Delete all tasks associated with the board
    const deleteTasksQuery = `
      DELETE FROM tasks
      WHERE category = (
        SELECT boardname FROM category WHERE id = $1
      )`;
    await client.query(deleteTasksQuery, [id]);

    // Delete the board itself
    const deleteBoardQuery = `
      DELETE FROM category
      WHERE id = $1`;
    await client.query(deleteBoardQuery, [id]);

    res
      .status(200)
      .send({ message: "Board and associated tasks deleted successfully" });
  } catch (error) {
    console.error("Error deleting board and tasks:", error);
    res.status(500).send({ message: "Internal server error" });
  } finally {
    client.release();
  }
});

// Add Task
app.post("/add-task", verifyToken, async (req, res) => {
  const { deadline, description, priority, title, category, uId } = req.body;
  const query =
    "INSERT INTO tasks (deadline, description, priority, title, category, uId) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *";
  const values = [deadline, description, priority, title, category, uId];
  const client = await pool.connect();
  try {
    const result = await client.query(query, values);
    res.send({ message: "Successfully Added!", data: result.rows[0] });
  } catch (error) {
    console.error("Error adding task:", error);
    res.status(500).send({ message: "Internal server error" });
  } finally {
    client.release();
  }
});

// Get tasks by user ID
app.get("/tasks/:uid", verifyToken, async (req, res) => {
  const { uid } = req.params;
  const query = "SELECT * FROM tasks WHERE uId = $1";
  const client = await pool.connect();
  try {
    const result = await client.query(query, [uid]);
    res.send(result.rows);
  } catch (error) {
    console.error("Error fetching tasks:", error);
    res.status(500).send({ message: "Internal server error" });
  } finally {
    client.release();
  }
});

// Delete task by ID
app.delete("/tasks/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  const query = "DELETE FROM tasks WHERE id = $1 RETURNING *";
  const client = await pool.connect();
  try {
    const result = await client.query(query, [id]);
    res.status(200).json({ message: "Deleted Successfully!" });
  } catch (error) {
    console.error("Error deleting task:", error);
    res.status(500).send({ message: "Internal server error" });
  } finally {
    client.release();
  }
});

// Update task details
app.put("/tasks/update-task/:id", verifyToken, async (req, res) => {
  const { id } = req.params;
  const { deadline, description, priority, title, category } = req.body;

  // Include category in the SQL query
  const query = `
    UPDATE tasks
    SET deadline = $1, description = $2, priority = $3, title = $4, category = $5
    WHERE id = $6 RETURNING *`;

  const values = [deadline, description, priority, title, category, id];

  const client = await pool.connect();
  try {
    const result = await client.query(query, values);

    // Send the updated task as response
    res.send(result.rows[0]);
  } catch (error) {
    console.error("Error updating task:", error);
    res.status(500).send({ message: "Internal server error" });
  } finally {
    client.release();
  }
});

// Update task category
app.put("/tasks/update-task-category/:uid", verifyToken, async (req, res) => {
  const { uid } = req.params;
  const { newTasks } = req.body; // Expecting an array of tasks in the body

  if (!Array.isArray(newTasks) || newTasks.length === 0) {
    return res.status(400).send({ message: "Invalid task data provided" });
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Delete existing newTasks with the same uid
    const deleteQuery = "DELETE FROM newTasks WHERE uid = $1";
    await client.query(deleteQuery, [uid]);

    // Insert the updated newTasks
    const insertQuery =
      "INSERT INTO newTasks (id, title, description, category, priority, deadline, uid) VALUES ($1, $2, $3, $4, $5, $6, $7)";
    for (let i = 0; i < newTasks.length; i++) {
      const task = newTasks[i];
      await client.query(insertQuery, [
        task.id,
        task.title,
        task.description,
        task.category,
        task.priority,
        task.deadline,
        uid, // Use the same uid for each task
      ]);
    }

    await client.query("COMMIT");

    res.send({ message: "Tasks updated successfully" });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Error updating tasks:", error);
    res.status(500).send({ message: "Internal server error" });
  } finally {
    client.release();
  }
});

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
    client.release(); // Release the client after checking

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
