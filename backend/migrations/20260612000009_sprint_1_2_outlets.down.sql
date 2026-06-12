DROP TABLE IF EXISTS user_outlets;
DROP TABLE IF EXISTS outlet_ownerships;
DROP TABLE IF EXISTS outlets;

DELETE FROM permissions
WHERE name = ANY(ARRAY[
    'outlets:read',
    'outlets:create',
    'outlets:update',
    'outlets:delete',
    'outlet_ownerships:read',
    'outlet_ownerships:transfer',
    'outlet_users:read',
    'outlet_users:assign',
    'outlet_users:revoke'
]);
