CREATE TABLE IF NOT EXISTS counter_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  counter     INTEGER NOT NULL,
  state       TEXT NOT NULL CHECK(state IN ('counter', 'cleaning')),
  recorded_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sensor_readings (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  temp        REAL NOT NULL,
  humidity    REAL NOT NULL,
  recorded_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS heartbeats (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  recorded_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_counter_events_recorded_at ON counter_events(recorded_at);
CREATE INDEX IF NOT EXISTS idx_sensor_readings_recorded_at ON sensor_readings(recorded_at);
CREATE INDEX IF NOT EXISTS idx_heartbeats_recorded_at ON heartbeats(recorded_at);
