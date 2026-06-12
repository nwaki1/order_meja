INSERT INTO permissions (name, description) VALUES
    ('users:read', 'View users'),
    ('users:create', 'Create users'),
    ('users:update', 'Update users'),
    ('users:delete', 'Delete users'),
    ('roles:read', 'View roles and role permissions'),
    ('roles:create', 'Create roles'),
    ('roles:update', 'Update roles'),
    ('roles:delete', 'Delete roles'),
    ('roles:update_permissions', 'Update role permissions'),
    ('permissions:read', 'View permissions'),
    ('permissions:create', 'Create permissions'),
    ('permissions:update', 'Update permissions'),
    ('permissions:delete', 'Delete permissions'),
    ('tenants:read', 'View all tenants'),
    ('tenants:create', 'Create tenants'),
    ('tenants:update', 'Update tenants'),
    ('tenants:delete', 'Deactivate tenants'),
    ('tenant_users:read', 'View tenant user assignments'),
    ('tenant_users:assign', 'Assign users to tenants'),
    ('tenant_users:revoke', 'Revoke user access to tenants')
ON CONFLICT (name) DO UPDATE
SET description = EXCLUDED.description,
    updated_at = NOW();

INSERT INTO role_permissions (role_name, permission_name)
SELECT 'admin', p.name
FROM permissions p
WHERE p.name = ANY(ARRAY[
    'users:read',
    'users:create',
    'users:update',
    'users:delete',
    'roles:read',
    'roles:create',
    'roles:update',
    'roles:delete',
    'roles:update_permissions',
    'permissions:read',
    'permissions:create',
    'permissions:update',
    'permissions:delete',
    'tenants:read',
    'tenants:create',
    'tenants:update',
    'tenants:delete',
    'tenant_users:read',
    'tenant_users:assign',
    'tenant_users:revoke'
])
ON CONFLICT DO NOTHING;
