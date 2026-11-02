-- Data the end-to-end tests read. Tests that change data create their own tables.
CREATE TABLE users (
  id serial PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true
);

INSERT INTO users (name, email, active)
SELECT 'User ' || n, 'user' || n || '@example.com', n % 3 <> 0
FROM generate_series(1, 30) AS n;

UPDATE users SET name = 'Alice Example', email = 'alice@example.com' WHERE id = 1;

CREATE TABLE orders (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users (id),
  total numeric(10, 2) NOT NULL
);

INSERT INTO orders (user_id, total) SELECT (n % 30) + 1, n * 10.5 FROM generate_series(1, 10) AS n;
