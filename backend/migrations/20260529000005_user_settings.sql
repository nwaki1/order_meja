-- Per-user UI settings

CREATE TABLE IF NOT EXISTS user_settings (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    theme_mode TEXT NOT NULL DEFAULT 'auto',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT user_settings_theme_mode_check CHECK (theme_mode IN ('light', 'dark', 'auto'))
);

CREATE INDEX IF NOT EXISTS idx_user_settings_theme_mode ON user_settings(theme_mode);

INSERT INTO user_settings (user_id, theme_mode)
SELECT id, 'auto'
FROM users
ON CONFLICT (user_id) DO NOTHING;
