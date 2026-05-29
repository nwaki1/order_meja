-- RBAC foundation: roles + permissions + role_permissions

CREATE TABLE IF NOT EXISTS roles (
    name TEXT PRIMARY KEY,
    description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS permissions (
    name TEXT PRIMARY KEY,
    description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS role_permissions (
    role_name TEXT NOT NULL REFERENCES roles(name) ON DELETE CASCADE,
    permission_name TEXT NOT NULL REFERENCES permissions(name) ON DELETE CASCADE,
    PRIMARY KEY (role_name, permission_name)
);

-- Default roles
INSERT INTO roles (name, description) VALUES
    ('admin', 'Full access'),
    ('user', 'Standard user')
ON CONFLICT (name) DO NOTHING;

-- Default permissions (extend as needed)
INSERT INTO permissions (name, description) VALUES
    ('admin:ping', 'Access admin ping endpoint')
ON CONFLICT (name) DO NOTHING;

-- Grant defaults
INSERT INTO role_permissions (role_name, permission_name) VALUES
    ('admin', 'admin:ping')
ON CONFLICT DO NOTHING;

-- Ensure existing users have a valid role
UPDATE users SET role = 'user' WHERE role IS NULL OR role = '';
INSERT INTO roles (name, description) VALUES ('user', 'Standard user') ON CONFLICT (name) DO NOTHING;
INSERT INTO roles (name, description) VALUES ('admin', 'Full access') ON CONFLICT (name) DO NOTHING;

-- Add FK constraint from users.role -> roles.name if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'users_role_fkey'
    ) THEN
        ALTER TABLE users
            ADD CONSTRAINT users_role_fkey
            FOREIGN KEY (role) REFERENCES roles(name);
    END IF;
END $$;

