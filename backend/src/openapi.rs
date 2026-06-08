use utoipa::{Modify, OpenApi};
use utoipa::openapi::security::{HttpAuthScheme, HttpBuilder, SecurityScheme};

use crate::routes::health::HealthResponse;
use crate::routes::auth::{
    ForgotPasswordRequest, LoginRequest, LoginResponse, RegisterRequest, ResetPasswordRequest, UpdateThemeModeRequest, UserInfo,
};
use crate::routes::admin::AdminPingResponse;

struct SecurityAddon;

impl Modify for SecurityAddon {
    fn modify(&self, openapi: &mut utoipa::openapi::OpenApi) {
        let bearer = SecurityScheme::Http(
            HttpBuilder::new()
                .scheme(HttpAuthScheme::Bearer)
                .bearer_format("opaque-session-token")
                .build(),
        );

        openapi
            .components
            .get_or_insert_with(Default::default)
            .add_security_scheme("bearer_auth", bearer);
    }
}

#[derive(OpenApi)]
#[openapi(
    paths(
        crate::routes::health::health_check,
        crate::routes::auth::login,
        crate::routes::auth::register,
        crate::routes::auth::logout,
        crate::routes::auth::me,
        crate::routes::auth::update_theme_mode,
        crate::routes::auth::forgot_password,
        crate::routes::auth::reset_password,
        crate::routes::admin::ping,
    ),
    components(schemas(
        HealthResponse,
        LoginRequest,
        LoginResponse,
        RegisterRequest,
        UserInfo,
        UpdateThemeModeRequest,
        ForgotPasswordRequest,
        ResetPasswordRequest,
        AdminPingResponse
    )),
    modifiers(&SecurityAddon),
    tags(
        (name = "Health", description = "Service health endpoints"),
        (name = "Auth", description = "Login/logout endpoints"),
        (name = "Admin", description = "Admin-only endpoints")
    )
)]
pub struct ApiDoc;
