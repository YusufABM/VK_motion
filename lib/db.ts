import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), 'db', 'vkmotion.db')

// Ensure db directory exists
const dbDir = path.dirname(DB_PATH)
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })

const db = new Database(DB_PATH)
db.pragma('busy_timeout = 5000')  // wait up to 5s before throwing SQLITE_BUSY
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

const schema = fs.readFileSync(path.join(process.cwd(), 'lib', 'schema.sql'), 'utf8')
db.exec(schema)

export default db
