CREATE TABLE accounts (
 id TEXT PRIMARY KEY NOT NULL,
 username TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL,
 salt TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE TABLE sessions (
 token_hash TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE TABLE preferences (
 user_id TEXT PRIMARY KEY NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 value TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE favorites (
 user_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 product_key TEXT NOT NULL,
 snapshot TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(user_id, product_key)
);
CREATE TABLE auth_limits (
 bucket TEXT PRIMARY KEY NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 expires_at INTEGER NOT NULL
);

CREATE TABLE user_catalogs (
 user_id TEXT PRIMARY KEY NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
 value TEXT NOT NULL
);
