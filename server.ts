import express from "express";
import { createServer as createViteServer } from "vite";
import sqlite3 from "sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Open DB
const db = new sqlite3.Database("dating_sim.db", (err) => {
  if (err) console.error("DB error:", err);
  else console.log("Connected to SQLite DB");
});

// Initialize tables
db.serialize(() => {
  db.run(`
    DROP TABLE IF EXISTS profiles;

    CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      age INTEGER,
      gender TEXT,
      body_type TEXT,
      personality TEXT,
      lifestyle TEXT,
      test_results TEXT,
      image TEXT,
      latitude REAL,
      longitude REAL,
      city TEXT
    );

    CREATE TABLE IF NOT EXISTS admin_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id INTEGER,
      profile_id INTEGER,
      reason TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS interactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER,
      type TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER,
      sender TEXT,
      content TEXT,
      type TEXT DEFAULT 'text',
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS preferences (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      body_type TEXT,
      personality TEXT,
      lifestyle TEXT,
      test_results TEXT
    );
  `);
});

// Seed profiles if empty
db.get("SELECT COUNT(*) as count FROM profiles", (err, row: any) => {
  if (err) return console.error(err);

  if (row.count === 0) {
    const initialProfiles = [
      { name: "Liza", age: 26, gender: "female", body_type: "slim", personality: JSON.stringify(["adventurous","friendly","playful"]), lifestyle: JSON.stringify(["traveler","socially_active"]), image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRCIyTZVXyb90oYHRiiX6YkNUc0CnzGwWjI3Q&s", latitude: 33.5731, longitude: -7.5898, city: "Casablanca" },
      { name: "Omar", age: 21, gender: "male", body_type: "muscular", personality: JSON.stringify(["confident","ambitious","independent"]), lifestyle: JSON.stringify(["fitness_oriented","tech_savvy"]), image: "https://t4.ftcdn.net/jpg/02/42/52/27/360_F_242522709_ZhoDmO1L1PHkL6yvVVNutSBGsk1Ob7m0.jpg", latitude: 34.0209, longitude: -6.8416, city: "Rabat" },
      // Add more profiles as needed
    ];

    const stmt = db.prepare(`INSERT INTO profiles 
      (name, age, gender, body_type, personality, lifestyle, test_results, image, latitude, longitude, city)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

    for (const p of initialProfiles) {
      const jitterLat = (Math.random() - 0.5) * 0.1;
      const jitterLon = (Math.random() - 0.5) * 0.1;
      const test_results = JSON.stringify({
        emotional_intelligence: Math.floor(Math.random() * 5) + 1,
        humor: Math.floor(Math.random() * 5) + 1,
        social_preferences: Math.floor(Math.random() * 5) + 1,
        lifestyle: Math.floor(Math.random() * 5) + 1,
        relationship_expectations: Math.floor(Math.random() * 5) + 1,
        intimacy: Math.floor(Math.random() * 5) + 1
      });
      stmt.run(p.name, p.age, p.gender, p.body_type, p.personality, p.lifestyle, test_results, p.image, p.latitude + jitterLat, p.longitude + jitterLon, p.city);
    }
    stmt.finalize();
  }
});

async function startServer() {
  const app = express();
  app.use(express.json());

  // ---------- PROFILES ----------
  app.get("/api/profiles", (req, res) => {
    db.all(`
      SELECT p.*, 
      (SELECT type FROM interactions WHERE profile_id = p.id ORDER BY timestamp DESC LIMIT 1) as last_interaction,
      (SELECT content FROM messages WHERE profile_id = p.id ORDER BY timestamp DESC LIMIT 1) as last_message,
      (SELECT timestamp FROM messages WHERE profile_id = p.id ORDER BY timestamp DESC LIMIT 1) as last_message_time
      FROM profiles p
      WHERE p.id NOT IN (SELECT profile_id FROM interactions WHERE type IN ('block', 'report'))
    `, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows.map(p => ({
        ...p,
        personality: JSON.parse(p.personality),
        lifestyle: JSON.parse(p.lifestyle),
        test_results: p.test_results ? JSON.parse(p.test_results) : {}
      })));
    });
  });

  // ---------- PREFERENCES ----------
  app.get("/api/preferences", (req, res) => {
    db.get("SELECT * FROM preferences WHERE id = 1", (err, prefs) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!prefs) return res.json(null);
      res.json({
        ...prefs,
        personality: JSON.parse(prefs.personality),
        test_results: prefs.test_results ? JSON.parse(prefs.test_results) : {}
      });
    });
  });

  app.post("/api/preferences", (req, res) => {
    const { body_type, personality, lifestyle, test_results } = req.body;
    db.run(`INSERT OR REPLACE INTO preferences (id, body_type, personality, lifestyle, test_results) VALUES (1, ?, ?, ?, ?)`,
      [body_type, JSON.stringify(personality), lifestyle, JSON.stringify(test_results)],
      (err) => {
        if (err) return res.status(500).json({ success: false, error: err.message });
        res.json({ success: true });
      });
  });

  // ---------- INTERACTIONS ----------
  app.post("/api/interactions", (req, res) => {
    const { profile_id, type } = req.body;
    db.run("INSERT INTO interactions (profile_id, type) VALUES (?, ?)", [profile_id, type], (err) => {
      if (err) return res.status(500).json({ success: false, error: err.message });

      let matched = false;
      if (type === 'like') matched = Math.random() > 0.5;
      res.json({ success: true, matched });
    });
  });

  // ---------- MESSAGES ----------
  app.get("/api/messages/:profileId", (req, res) => {
    db.all("SELECT * FROM messages WHERE profile_id = ? ORDER BY timestamp ASC", [req.params.profileId], (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  app.post("/api/messages", (req, res) => {
    const { profile_id, sender, content, type } = req.body;
    const badWords = ["97ba","zaml","tabon","tbon","9wd","qawd","qwd","9hba","qahba","tarma","trmtek","زامل","قحبة","قحاب","ترمة","زب","9aaaa7ba","tarmaaa","zamla","taaaarma","7wi","حوا","حوى","زملتيني","نلحسو","نمصو"];
    const hasBadWord = badWords.some(word => content.toLowerCase().includes(word.toLowerCase()));

    db.run("INSERT INTO messages (profile_id, sender, content, type) VALUES (?, ?, ?, ?)", [profile_id, sender, content, type || 'text'], function(err) {
      if (err) return res.status(500).json({ success: false, error: err.message });

      if (hasBadWord) {
        db.run("INSERT INTO admin_notifications (message_id, profile_id, reason) VALUES (?, ?, ?)", [this.lastID, profile_id, "Bad word detected"]);
        console.log(`[ADMIN NOTIFICATION] Flagged message from ${sender} to profile ${profile_id}: "${content}"`);
      }

      res.json({ success: true });
    });
  });

  // ---------- VITE DEV / PROD ----------
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => res.sendFile(path.join(__dirname, "dist/index.html")));
  }

  app.listen(3000, "0.0.0.0", () => console.log("Server running on http://localhost:3000"));
}

startServer();
