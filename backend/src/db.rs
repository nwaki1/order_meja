use sqlx::PgPool;

pub async fn create_pool(database_url: &str) -> sqlx::Result<PgPool> {
    sqlx::postgres::PgPoolOptions::new()
        .max_connections(10)
        .connect(database_url)
        .await
}
