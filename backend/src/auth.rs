use crate::{AppError, AppState, Result};
use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use axum::{
    async_trait,
    extract::FromRequestParts,
    http::{request::Parts, HeaderMap},
};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::FromRow;
use std::collections::HashSet;
use std::time::Duration;
use base64::Engine;
use utoipa::ToSchema;

const SESSION_TTL: Duration = Duration::from_secs(60 * 60 * 24 * 7); // 7 days

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum ThemeMode {
    Light,
    Dark,
    Auto,
}

impl ThemeMode {
    pub fn as_str(self) -> &'static str {
        match self {
            ThemeMode::Light => "light",
            ThemeMode::Dark => "dark",
            ThemeMode::Auto => "auto",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "light" => Some(Self::Light),
            "dark" => Some(Self::Dark),
            "auto" => Some(Self::Auto),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct AuthUser {
    pub id: uuid::Uuid,
    pub email: String,
    pub name: String,
    pub role: String,
    pub theme_mode: ThemeMode,
    pub session_id: uuid::Uuid,
    pub permissions: HashSet<String>,
}

#[derive(Debug, FromRow)]
struct SessionRow {
    session_id: uuid::Uuid,
    user_id: uuid::Uuid,
    email: String,
    name: String,
    role: String,
    theme_mode: String,
    permissions: Vec<String>,
}

pub fn hash_password(password: &str) -> Result<String> {
    let salt = SaltString::generate(&mut rand::thread_rng());
    let argon2 = Argon2::default();

    let hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?
        .to_string();

    Ok(hash)
}

pub fn verify_password(password: &str, password_hash: &str) -> Result<bool> {
    let parsed = PasswordHash::new(password_hash)
        .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok())
}

pub fn bearer_token(headers: &HeaderMap) -> Option<String> {
    let value = headers.get(axum::http::header::AUTHORIZATION)?.to_str().ok()?;
    let value = value.strip_prefix("Bearer ")?;
    Some(value.trim().to_string())
}

pub fn token_hash_hex(token: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(token.as_bytes());
    hex::encode(hasher.finalize())
}

pub fn generate_session_token() -> String {
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    // URL-safe and compact enough; still return as string for Bearer token usage.
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

pub async fn revoke_all_sessions_for_user(db: &sqlx::PgPool, user_id: uuid::Uuid) -> Result<()> {
    sqlx::query(
        r#"
        UPDATE sessions
        SET revoked_at = NOW()
        WHERE user_id = $1 AND revoked_at IS NULL
        "#,
    )
    .bind(user_id)
    .execute(db)
    .await?;
    Ok(())
}

pub async fn create_session(db: &sqlx::PgPool, user_id: uuid::Uuid) -> Result<(String, chrono::DateTime<chrono::Utc>)> {
    let token = generate_session_token();
    let token_hash = token_hash_hex(&token);
    let expires_at = chrono::Utc::now()
        + chrono::Duration::from_std(SESSION_TTL).map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;

    sqlx::query(
        r#"
        INSERT INTO sessions (user_id, token_hash, expires_at)
        VALUES ($1, $2, $3)
        "#,
    )
    .bind(user_id)
    .bind(token_hash)
    .bind(expires_at)
    .execute(db)
    .await?;

    Ok((token, expires_at))
}

pub async fn revoke_session(db: &sqlx::PgPool, token: &str) -> Result<()> {
    let token_hash = token_hash_hex(token);
    sqlx::query(
        r#"
        UPDATE sessions
        SET revoked_at = NOW()
        WHERE token_hash = $1 AND revoked_at IS NULL
        "#,
    )
    .bind(token_hash)
    .execute(db)
    .await?;
    Ok(())
}

pub async fn authenticate_token(db: &sqlx::PgPool, token: &str) -> Result<Option<AuthUser>> {
    let token_hash = token_hash_hex(token);

    let row = sqlx::query_as::<_, SessionRow>(
        r#"
        SELECT
            s.id AS session_id,
            u.id AS user_id,
            u.email,
            u.name,
            u.role,
            COALESCE(us.theme_mode, 'auto') AS theme_mode,
            COALESCE(array_remove(array_agg(p.name), NULL), '{}') AS permissions
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        LEFT JOIN user_settings us ON us.user_id = u.id
        LEFT JOIN role_permissions rp ON rp.role_name = u.role
        LEFT JOIN permissions p ON p.name = rp.permission_name
        WHERE s.token_hash = $1
          AND s.revoked_at IS NULL
          AND s.expires_at > NOW()
        GROUP BY s.id, u.id, us.theme_mode
        "#,
    )
    .bind(token_hash)
    .fetch_optional(db)
    .await?;

    Ok(row.map(|r| AuthUser {
        id: r.user_id,
        email: r.email,
        name: r.name,
        role: r.role,
        theme_mode: ThemeMode::parse(&r.theme_mode).unwrap_or(ThemeMode::Auto),
        session_id: r.session_id,
        permissions: r.permissions.into_iter().collect(),
    }))
}

pub async fn ensure_user_settings(db: &sqlx::PgPool, user_id: uuid::Uuid) -> Result<()> {
    sqlx::query(
        r#"
        INSERT INTO user_settings (user_id, theme_mode)
        VALUES ($1, 'auto')
        ON CONFLICT (user_id) DO NOTHING
        "#,
    )
    .bind(user_id)
    .execute(db)
    .await?;
    Ok(())
}

#[async_trait]
impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> std::result::Result<Self, Self::Rejection> {
        let token = bearer_token(&parts.headers).ok_or(AppError::Unauthorized)?;
        let user = authenticate_token(&state.db, &token).await?.ok_or(AppError::Unauthorized)?;
        Ok(user)
    }
}

pub fn require_role(user: &AuthUser, required: &str) -> Result<()> {
    if user.role == required {
        Ok(())
    } else {
        Err(AppError::Forbidden)
    }
}

pub fn require_permission(user: &AuthUser, permission: &str) -> Result<()> {
    if user.permissions.contains(permission) {
        Ok(())
    } else {
        Err(AppError::Forbidden)
    }
}

pub async fn require_tenant_access(
    db: &sqlx::PgPool,
    user: &AuthUser,
    tenant_id: uuid::Uuid,
) -> Result<()> {
    if user.role == "admin" {
        return Ok(());
    }

    let has_access = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(
            SELECT 1
            FROM user_tenants ut
            JOIN tenants t ON t.id = ut.tenant_id
            WHERE ut.user_id = $1
              AND ut.tenant_id = $2
              AND ut.is_active = TRUE
              AND t.is_active = TRUE
        )
        "#,
    )
    .bind(user.id)
    .bind(tenant_id)
    .fetch_one(db)
    .await?;

    if has_access {
        Ok(())
    } else {
        Err(AppError::Forbidden)
    }
}

pub async fn bootstrap_admin_if_configured(db: &sqlx::PgPool) -> Result<()> {
    let email = match std::env::var("BOOTSTRAP_ADMIN_EMAIL") {
        Ok(v) if !v.trim().is_empty() => v,
        _ => return Ok(()),
    };
    let password = std::env::var("BOOTSTRAP_ADMIN_PASSWORD")
        .map_err(|_| AppError::BadRequest("BOOTSTRAP_ADMIN_PASSWORD must be set when BOOTSTRAP_ADMIN_EMAIL is set".into()))?;
    let update_password = match std::env::var("BOOTSTRAP_ADMIN_UPDATE_PASSWORD") {
        Ok(v) => matches!(v.trim().to_ascii_lowercase().as_str(), "1" | "true" | "yes" | "y"),
        Err(_) => false,
    };

    let exists = sqlx::query_scalar::<_, bool>(
        r#"
        SELECT EXISTS(SELECT 1 FROM users WHERE email = $1)
        "#,
    )
    .bind(&email)
    .fetch_one(db)
    .await?;

    if exists {
        if update_password {
            let password_hash = hash_password(&password)?;            
            sqlx::query(
                r#"
                UPDATE users
                SET password_hash = $2, role = 'admin', updated_at = NOW()
                WHERE email = $1
                "#,
            )
            .bind(&email)
            .bind(password_hash)
            .execute(db)
            .await?;

            let user_id = sqlx::query_scalar::<_, uuid::Uuid>(
                r#"
                SELECT id
                FROM users
                WHERE email = $1
                "#,
            )
            .bind(&email)
            .fetch_one(db)
            .await?;
            ensure_user_settings(db, user_id).await?;

            tracing::info!("Updated admin password via BOOTSTRAP_ADMIN_UPDATE_PASSWORD for: {}", email);
        }
        return Ok(());
    }

    let password_hash = hash_password(&password)?;

    sqlx::query(
        r#"
        INSERT INTO users (email, name, role, password_hash)
        VALUES ($1, $2, 'admin', $3)
        "#,
    )
    .bind(&email)
    .bind("Admin")
    .bind(password_hash)
    .execute(db)
    .await?;

    let user_id = sqlx::query_scalar::<_, uuid::Uuid>(
        r#"
        SELECT id
        FROM users
        WHERE email = $1
        "#,
    )
    .bind(&email)
    .fetch_one(db)
    .await?;
    ensure_user_settings(db, user_id).await?;

    tracing::info!("Bootstrapped admin user: {}", email);
    Ok(())
}
