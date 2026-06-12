DELETE FROM permissions
WHERE name = ANY(ARRAY[
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
]);
