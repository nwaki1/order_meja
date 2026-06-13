use crate::{auth, AppError, AppState, Result};
use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::get,
    Json, Router,
};
use chrono::NaiveTime;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct ShiftTemplateResponse {
    pub id: Uuid,
    pub outlet_id: Uuid,
    pub outlet_code: String,
    pub outlet_name: String,
    pub name: String,
    pub start_time: NaiveTime,
    pub end_time: NaiveTime,
    pub is_active: bool,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
}

#[derive(Debug, Serialize)]
pub struct ShiftTemplatesResponse {
    pub value: Vec<ShiftTemplateResponse>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CreateShiftTemplateRequest {
    pub name: String,
    pub start_time: String,
    pub end_time: String,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct UpdateShiftTemplateRequest {
    pub name: Option<String>,
    pub start_time: Option<String>,
    pub end_time: Option<String>,
    pub is_active: Option<bool>,
}

// /shift-templates
pub fn router() -> Router<AppState> {
    Router::<AppState>::new().route(
        "/:id",
        get(get_shift_template)
            .put(update_shift_template)
            .delete(deactivate_shift_template),
    )
}

// Outlet-scoped routes merged into the /outlets nest.
pub fn outlet_router() -> Router<AppState> {
    Router::<AppState>::new().route(
        "/:id/shift-templates",
        get(list_outlet_shift_templates).post(create_shift_template),
    )
}

// Accepts "HH:MM" or "HH:MM:SS".
pub fn parse_time(value: &str, field: &str) -> Result<NaiveTime> {
    let value = value.trim();
    NaiveTime::parse_from_str(value, "%H:%M:%S")
        .or_else(|_| NaiveTime::parse_from_str(value, "%H:%M"))
        .map_err(|_| {
            AppError::validation(
                "Lengkapi field yang required atau isi teks yang sesuai.",
                field,
                "Format waktu harus HH:MM atau HH:MM:SS",
            )
        })
}

fn validate_name(name: &str) -> Result<&str> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::validation(
            "Lengkapi field yang required atau isi teks yang sesuai.",
            "name",
            "Nama template wajib diisi",
        ));
    }
    Ok(name)
}

fn map_template_db_error(e: sqlx::Error) -> AppError {
    if let sqlx::Error::Database(ref db_err) = e {
        if db_err.constraint() == Some("idx_shift_templates_outlet_name_unique") {
            return AppError::validation(
                "Lengkapi field yang required atau isi teks yang sesuai.",
                "name",
                "Nama template sudah ada pada outlet ini",
            );
        }
    }
    AppError::Database(e)
}

async fn ensure_active_outlet(db: &sqlx::PgPool, outlet_id: Uuid) -> Result<()> {
    let exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM outlets WHERE id = $1 AND is_active = TRUE)",
    )
    .bind(outlet_id)
    .fetch_one(db)
    .await?;
    if exists {
        Ok(())
    } else {
        Err(AppError::NotFound(
            "Outlet tidak ditemukan atau tidak aktif".into(),
        ))
    }
}

async fn template_outlet_id(db: &sqlx::PgPool, template_id: Uuid) -> Result<Uuid> {
    sqlx::query_scalar::<_, Uuid>("SELECT outlet_id FROM shift_templates WHERE id = $1")
        .bind(template_id)
        .fetch_optional(db)
        .await?
        .ok_or_else(|| AppError::NotFound("Template shift tidak ditemukan".into()))
}

async fn fetch_template(db: &sqlx::PgPool, template_id: Uuid) -> Result<ShiftTemplateResponse> {
    sqlx::query_as::<_, ShiftTemplateResponse>(
        r#"
        SELECT
            st.id, st.outlet_id, o.code AS outlet_code, o.name AS outlet_name,
            st.name, st.start_time, st.end_time, st.is_active, st.created_at, st.updated_at
        FROM shift_templates st
        JOIN outlets o ON o.id = st.outlet_id
        WHERE st.id = $1
        "#,
    )
    .bind(template_id)
    .fetch_optional(db)
    .await?
    .ok_or_else(|| AppError::NotFound("Template shift tidak ditemukan".into()))
}

async fn list_outlet_shift_templates(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(outlet_id): Path<Uuid>,
) -> Result<Json<ShiftTemplatesResponse>> {
    auth::require_outlet_access(&state.db, &user, outlet_id).await?;

    let templates = sqlx::query_as::<_, ShiftTemplateResponse>(
        r#"
        SELECT
            st.id, st.outlet_id, o.code AS outlet_code, o.name AS outlet_name,
            st.name, st.start_time, st.end_time, st.is_active, st.created_at, st.updated_at
        FROM shift_templates st
        JOIN outlets o ON o.id = st.outlet_id
        WHERE st.outlet_id = $1
        ORDER BY st.is_active DESC, st.name ASC
        "#,
    )
    .bind(outlet_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(ShiftTemplatesResponse { value: templates }))
}

async fn create_shift_template(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(outlet_id): Path<Uuid>,
    Json(body): Json<CreateShiftTemplateRequest>,
) -> Result<(StatusCode, Json<ShiftTemplateResponse>)> {
    auth::require_permission(&user, "shift_templates:create")?;
    ensure_active_outlet(&state.db, outlet_id).await?;

    let name = validate_name(&body.name)?;
    let start_time = parse_time(&body.start_time, "start_time")?;
    let end_time = parse_time(&body.end_time, "end_time")?;

    let template_id = sqlx::query_scalar::<_, Uuid>(
        r#"
        INSERT INTO shift_templates (outlet_id, name, start_time, end_time)
        VALUES ($1, $2, $3, $4)
        RETURNING id
        "#,
    )
    .bind(outlet_id)
    .bind(name)
    .bind(start_time)
    .bind(end_time)
    .fetch_one(&state.db)
    .await
    .map_err(map_template_db_error)?;

    let template = fetch_template(&state.db, template_id).await?;
    Ok((StatusCode::CREATED, Json(template)))
}

async fn get_shift_template(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<Json<ShiftTemplateResponse>> {
    let outlet_id = template_outlet_id(&state.db, id).await?;
    auth::require_outlet_access(&state.db, &user, outlet_id).await?;
    Ok(Json(fetch_template(&state.db, id).await?))
}

async fn update_shift_template(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateShiftTemplateRequest>,
) -> Result<Json<ShiftTemplateResponse>> {
    auth::require_permission(&user, "shift_templates:update")?;
    template_outlet_id(&state.db, id).await?;

    let name = match &body.name {
        Some(name) => Some(validate_name(name)?),
        None => None,
    };
    let start_time = match &body.start_time {
        Some(t) => Some(parse_time(t, "start_time")?),
        None => None,
    };
    let end_time = match &body.end_time {
        Some(t) => Some(parse_time(t, "end_time")?),
        None => None,
    };

    let result = sqlx::query(
        r#"
        UPDATE shift_templates SET
            name       = COALESCE($2, name),
            start_time = COALESCE($3, start_time),
            end_time   = COALESCE($4, end_time),
            is_active  = COALESCE($5, is_active),
            updated_at = NOW()
        WHERE id = $1
        "#,
    )
    .bind(id)
    .bind(name)
    .bind(start_time)
    .bind(end_time)
    .bind(body.is_active)
    .execute(&state.db)
    .await
    .map_err(map_template_db_error)?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Template shift tidak ditemukan".into()));
    }

    Ok(Json(fetch_template(&state.db, id).await?))
}

async fn deactivate_shift_template(
    user: auth::AuthUser,
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> Result<StatusCode> {
    auth::require_permission(&user, "shift_templates:delete")?;
    let result = sqlx::query(
        "UPDATE shift_templates SET is_active = FALSE, updated_at = NOW() WHERE id = $1",
    )
    .bind(id)
    .execute(&state.db)
    .await?;
    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Template shift tidak ditemukan".into()));
    }
    Ok(StatusCode::NO_CONTENT)
}
