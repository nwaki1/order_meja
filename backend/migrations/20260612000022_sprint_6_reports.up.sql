-- Sprint 6 adds operational reports. No new tables: only a read permission for
-- the aggregation endpoints.
INSERT INTO permissions (name, description) VALUES
    ('reports:read', 'View operational dashboard and reports')
ON CONFLICT (name) DO UPDATE
SET description = EXCLUDED.description,
    updated_at  = NOW();

INSERT INTO role_permissions (role_name, permission_name)
SELECT 'admin', p.name
FROM permissions p
WHERE p.name = 'reports:read'
ON CONFLICT DO NOTHING;
