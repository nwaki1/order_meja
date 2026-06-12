use crate::{auth, AppError, AppState, Result};
use axum::{
    extract::State,
    http::StatusCode,
    http::HeaderMap,
    routing::{get, patch, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use utoipa::ToSchema;

#[derive(Debug, Deserialize, ToSchema)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct RegisterRequest {
    pub email: String,
    pub name: String,
    pub password: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct LoginResponse {
    pub token_type: &'static str,
    pub access_token: String,
    pub expires_at: chrono::DateTime<chrono::Utc>,
    pub user: UserInfo,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct UserInfo {
    pub id: uuid::Uuid,
    pub email: String,
    pub name: String,
    pub role: String,
    pub theme_mode: auth::ThemeMode,
    pub permissions: Vec<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateThemeModeRequest {
    pub theme_mode: auth::ThemeMode,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct ForgotPasswordRequest {
    pub email: String,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct ResetPasswordRequest {
    pub token: String,
    pub new_password: String,
}

#[derive(Debug, FromRow)]
struct UserWithPasswordRow {
    id: uuid::Uuid,
    email: String,
    name: String,
    role: String,
    password_hash: Option<String>,
    theme_mode: Option<String>,
}

pub fn router() -> Router<AppState> {
    Router::<AppState>::new()
        .route("/register", post(register))
        .route("/login", post(login))
        .route("/logout", post(logout))
        .route("/me", get(me))
        .route("/me/settings", patch(update_theme_mode))
        .route("/forgot-password", post(forgot_password))
        .route("/reset-password", post(reset_password))
}

#[utoipa::path(
    post,
    path = "/api/v1/auth/register",
    request_body = RegisterRequest,
    responses(
        (status = 201, description = "Register success", body = UserInfo),
        (status = 400, description = "Invalid input")
    ),
    tag = "Auth"
)]
pub async fn register(
    State(state): State<AppState>,
    Json(payload): Json<RegisterRequest>,
) -> Result<(StatusCode, Json<UserInfo>)> {
    if payload.email.trim().is_empty() || !payload.email.contains('@') {
        return Err(AppError::BadRequest("Invalid email".into()));
    }
    if payload.name.trim().is_empty() {
        return Err(AppError::BadRequest("Name is required".into()));
    }
    if payload.password.len() < 8 {
        return Err(AppError::BadRequest("Password must be at least 8 characters".into()));
    }

    let password_hash = auth::hash_password(&payload.password)?;

    let row = sqlx::query_as::<_, UserWithPasswordRow>(
        r#"
        WITH new_user AS (
            INSERT INTO users (email, name, role, password_hash)
            VALUES ($1, $2, 'user', $3)
            RETURNING id, email, name, role, password_hash
        )
        SELECT
            nu.id,
            nu.email,
            nu.name,
            nu.role,
            nu.password_hash,
            'auto' AS theme_mode
        FROM new_user nu
        "#,
    )
    .bind(payload.email)
    .bind(payload.name)
    .bind(password_hash)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        // Unique violation -> nicer message
        if let sqlx::Error::Database(db) = &e {
            if db.code().as_deref() == Some("23505") {
                return AppError::BadRequest("Email already registered".into());
            }
        }
        AppError::Database(e)
    })?;

    auth::ensure_user_settings(&state.db, row.id).await?;

    Ok((
        StatusCode::CREATED,
        Json(UserInfo {
            id: row.id,
            email: row.email,
            name: row.name,
            role: row.role,
            theme_mode: auth::ThemeMode::Auto,
            permissions: Vec::new(),
        }),
    ))
}

#[utoipa::path(
    post,
    path = "/api/v1/auth/login",
    request_body = LoginRequest,
    responses(
        (status = 200, description = "Login success", body = LoginResponse),
        (status = 401, description = "Invalid credentials")
    ),
    tag = "Auth"
)]
pub async fn login(
    State(state): State<AppState>,
    Json(payload): Json<LoginRequest>,
) -> Result<Json<LoginResponse>> {
    let user = sqlx::query_as::<_, UserWithPasswordRow>(
        r#"
        SELECT
            u.id,
            u.email,
            u.name,
            u.role,
            u.password_hash,
            COALESCE(us.theme_mode, 'auto') AS theme_mode
        FROM users u
        LEFT JOIN user_settings us ON us.user_id = u.id
        WHERE u.email = $1
        "#,
    )
    .bind(payload.email)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::Unauthorized)?;

    let password_hash = user.password_hash.ok_or(AppError::Unauthorized)?;
    let ok = auth::verify_password(&payload.password, &password_hash)?;
    if !ok {
        return Err(AppError::Unauthorized);
    }

    let (token, expires_at) = auth::create_session(&state.db, user.id).await?;
    let auth_user = auth::authenticate_token(&state.db, &token)
        .await?
        .ok_or(AppError::Unauthorized)?;
    let mut permissions: Vec<String> = auth_user.permissions.into_iter().collect();
    permissions.sort();

    Ok(Json(LoginResponse {
        token_type: "Bearer",
        access_token: token,
        expires_at,
        user: UserInfo {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            theme_mode: auth::ThemeMode::parse(user.theme_mode.as_deref().unwrap_or("auto"))
                .unwrap_or(auth::ThemeMode::Auto),
            permissions,
        },
    }))
}

#[utoipa::path(
    post,
    path = "/api/v1/auth/logout",
    responses((status = 204, description = "Logged out")),
    security(("bearer_auth" = [])),
    tag = "Auth"
)]
pub async fn logout(
    State(state): State<AppState>,
    headers: HeaderMap,
    _user: auth::AuthUser,
) -> Result<StatusCode> {
    let token = auth::bearer_token(&headers).ok_or(AppError::Unauthorized)?;
    auth::revoke_session(&state.db, &token).await?;
    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    get,
    path = "/api/v1/auth/me",
    responses((status = 200, description = "Current user", body = UserInfo)),
    security(("bearer_auth" = [])),
    tag = "Auth"
)]
pub async fn me(user: auth::AuthUser) -> Result<Json<UserInfo>> {
    let mut permissions: Vec<String> = user.permissions.iter().cloned().collect();
    permissions.sort();

    Ok(Json(UserInfo {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        theme_mode: user.theme_mode,
        permissions,
    }))
}

#[utoipa::path(
    patch,
    path = "/api/v1/auth/me/settings",
    request_body = UpdateThemeModeRequest,
    responses(
        (status = 200, description = "Theme updated", body = UserInfo),
        (status = 400, description = "Invalid theme mode")
    ),
    security(("bearer_auth" = [])),
    tag = "Auth"
)]
pub async fn update_theme_mode(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Json(payload): Json<UpdateThemeModeRequest>,
) -> Result<Json<UserInfo>> {
    let theme_mode = payload.theme_mode;
    sqlx::query(
        r#"
        INSERT INTO user_settings (user_id, theme_mode)
        VALUES ($1, $2)
        ON CONFLICT (user_id)
        DO UPDATE SET theme_mode = EXCLUDED.theme_mode, updated_at = NOW()
        "#,
    )
    .bind(user.id)
    .bind(theme_mode.as_str())
    .execute(&state.db)
    .await?;
    let mut permissions: Vec<String> = user.permissions.iter().cloned().collect();
    permissions.sort();

    Ok(Json(UserInfo {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        theme_mode,
        permissions,
    }))
}

#[utoipa::path(
    post,
    path = "/api/v1/auth/forgot-password",
    request_body = ForgotPasswordRequest,
    responses((status = 204, description = "If account exists, an email will be sent")),
    tag = "Auth"
)]
pub async fn forgot_password(
    State(state): State<AppState>,
    Json(payload): Json<ForgotPasswordRequest>,
) -> Result<StatusCode> {
    let email = payload.email.trim().to_string();
    if email.is_empty() {
        return Err(AppError::BadRequest("Email is required".into()));
    }

    let user = sqlx::query_as::<_, UserWithPasswordRow>(
        r#"
        SELECT
            u.id,
            u.email,
            u.name,
            u.role,
            u.password_hash,
            COALESCE(us.theme_mode, 'auto') AS theme_mode
        FROM users u
        LEFT JOIN user_settings us ON us.user_id = u.id
        WHERE u.email = $1
        "#,
    )
    .bind(&email)
    .fetch_optional(&state.db)
    .await?;

    // Always return 204 to prevent user enumeration.
    if let Some(user) = user {
        if user.password_hash.is_some() {
            let token = auth::generate_session_token();
            let token_hash = auth::token_hash_hex(&token);
            let expires_at = chrono::Utc::now() + chrono::Duration::hours(1);

            sqlx::query(
                r#"
                INSERT INTO password_resets (user_id, token_hash, expires_at)
                VALUES ($1, $2, $3)
                "#,
            )
            .bind(user.id)
            .bind(token_hash)
            .bind(expires_at)
            .execute(&state.db)
            .await?;

            let base = std::env::var("PASSWORD_RESET_BASE_URL").unwrap_or_else(|_| "http://localhost:3000".to_string());
            let reset_link = format!("{}/reset-password?token={}", base.trim_end_matches('/'), token);
            state.email.send_password_reset(&email, &reset_link).await?;
        }
    }

    Ok(StatusCode::NO_CONTENT)
}

#[utoipa::path(
    post,
    path = "/api/v1/auth/reset-password",
    request_body = ResetPasswordRequest,
    responses(
        (status = 204, description = "Password reset success"),
        (status = 400, description = "Invalid token or password")
    ),
    tag = "Auth"
)]
pub async fn reset_password(
    State(state): State<AppState>,
    Json(payload): Json<ResetPasswordRequest>,
) -> Result<StatusCode> {
    if payload.token.trim().is_empty() {
        return Err(AppError::BadRequest("Token is required".into()));
    }
    if payload.new_password.len() < 8 {
        return Err(AppError::BadRequest("Password must be at least 8 characters".into()));
    }

    let token_hash = auth::token_hash_hex(payload.token.trim());

    let row = sqlx::query_as::<_, (uuid::Uuid,)>(
        r#"
        SELECT user_id
        FROM password_resets
        WHERE token_hash = $1
          AND used_at IS NULL
          AND expires_at > NOW()
        "#,
    )
    .bind(token_hash)
    .fetch_optional(&state.db)
    .await?;

    let Some((user_id,)) = row else {
        return Err(AppError::BadRequest("Invalid or expired token".into()));
    };

    let password_hash = auth::hash_password(&payload.new_password)?;

    let mut tx = state.db.begin().await?;

    sqlx::query(
        r#"
        UPDATE users
        SET password_hash = $2, updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(user_id)
    .bind(password_hash)
    .execute(&mut *tx)
    .await?;

    sqlx::query(
        r#"
        UPDATE password_resets
        SET used_at = NOW()
        WHERE token_hash = $1
        "#,
    )
    .bind(auth::token_hash_hex(payload.token.trim()))
    .execute(&mut *tx)
    .await?;

    tx.commit().await?;

    auth::revoke_all_sessions_for_user(&state.db, user_id).await?;

    Ok(StatusCode::NO_CONTENT)
}
