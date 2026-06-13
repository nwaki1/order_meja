use crate::{auth, AppError, AppState, Result};
use axum::{extract::Multipart, routing::post, Json, Router};
use s3::{creds::Credentials, Bucket, Region};
use serde::Serialize;
use uuid::Uuid;

const MAX_SIZE: usize = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME: [&str; 5] = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/jpg",
];

#[derive(Debug, Serialize)]
pub struct UploadResponse {
    pub url: String,
    pub key: String,
    pub filename: String,
    pub category: Option<String>,
    pub mimetype: String,
    pub size: usize,
}

pub fn router() -> Router<AppState> {
    Router::<AppState>::new().route("/upload", post(upload))
}

fn env_required(key: &str) -> Result<String> {
    std::env::var(key)
        .ok()
        .filter(|v| !v.trim().is_empty())
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("Konfigurasi {key} belum diatur")))
}

fn env_bool(key: &str, default: bool) -> bool {
    match std::env::var(key) {
        Ok(v) if !v.trim().is_empty() => {
            matches!(
                v.trim().to_ascii_lowercase().as_str(),
                "true" | "1" | "yes" | "y"
            )
        }
        _ => default,
    }
}

fn ext_for(filename: &str, mimetype: &str) -> String {
    if let Some(idx) = filename.rfind('.') {
        let ext = &filename[idx + 1..];
        if !ext.is_empty() && ext.len() <= 5 && ext.chars().all(|c| c.is_ascii_alphanumeric()) {
            return format!(".{}", ext.to_ascii_lowercase());
        }
    }
    match mimetype {
        "image/jpeg" | "image/jpg" => ".jpg".into(),
        "image/png" => ".png".into(),
        "image/gif" => ".gif".into(),
        "image/webp" => ".webp".into(),
        _ => "".into(),
    }
}

// Mirrors the reference: only letters, digits, slash, underscore, dash; no
// empty / "." / ".." segments.
fn normalize_category(raw: Option<String>) -> Result<Option<String>> {
    let Some(raw) = raw else {
        return Ok(None);
    };
    let normalized = raw.trim().replace('\\', "/").trim_matches('/').to_string();
    if normalized.is_empty() {
        return Ok(None);
    }
    let segments: Vec<&str> = normalized.split('/').collect();
    let unsafe_segment = segments
        .iter()
        .any(|s| s.is_empty() || *s == "." || *s == "..");
    let valid_chars = normalized
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '/' | '_' | '-'));
    if unsafe_segment || !valid_chars {
        return Err(AppError::BadRequest(
            "Path tidak valid. Gunakan huruf, angka, slash, underscore, atau dash".into(),
        ));
    }
    Ok(Some(normalized))
}

fn build_bucket() -> Result<Box<Bucket>> {
    let endpoint = env_required("S3_ENDPOINT")?;
    let region_name = std::env::var("S3_REGION").unwrap_or_else(|_| "us-east-1".to_string());
    let bucket_name = env_required("S3_BUCKET")?;
    let access = env_required("S3_ACCESS_KEY_ID")?;
    let secret = env_required("S3_SECRET_ACCESS_KEY")?;

    let credentials = Credentials::new(Some(&access), Some(&secret), None, None, None)
        .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;
    let region = Region::Custom {
        region: region_name,
        endpoint,
    };

    let mut bucket = Bucket::new(&bucket_name, region, credentials)
        .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;
    if env_bool("S3_FORCE_PATH_STYLE", false) {
        bucket = bucket.with_path_style();
    }
    // Send a canned public-read ACL on uploads when enabled (mirrors reference).
    if env_bool("S3_ACL_PUBLIC_READ", false) {
        bucket.add_header("x-amz-acl", "public-read");
    }
    Ok(bucket)
}

fn build_public_url(key: &str) -> Result<String> {
    let base = match std::env::var("S3_PUBLIC_URL_BASE") {
        Ok(v) if !v.trim().is_empty() => v.trim().trim_end_matches('/').to_string(),
        _ => {
            let endpoint = env_required("S3_ENDPOINT")?;
            let bucket = env_required("S3_BUCKET")?;
            format!("{}/{}", endpoint.trim_end_matches('/'), bucket)
        }
    };
    let encoded_key = key
        .split('/')
        .map(urlencoding_encode)
        .collect::<Vec<_>>()
        .join("/");
    Ok(format!("{base}/{encoded_key}"))
}

// Minimal path-segment percent encoding (keeps unreserved chars).
fn urlencoding_encode(segment: &str) -> String {
    let mut out = String::with_capacity(segment.len());
    for b in segment.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

async fn upload(_user: auth::AuthUser, mut multipart: Multipart) -> Result<Json<UploadResponse>> {
    let mut file_bytes: Option<Vec<u8>> = None;
    let mut file_name: String = String::new();
    let mut content_type: String = String::new();
    let mut category: Option<String> = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("Form tidak valid: {e}")))?
    {
        match field.name() {
            Some("file") => {
                file_name = field.file_name().unwrap_or("upload").to_string();
                content_type = field
                    .content_type()
                    .unwrap_or("application/octet-stream")
                    .to_string();
                let data = field
                    .bytes()
                    .await
                    .map_err(|e| AppError::BadRequest(format!("Gagal membaca file: {e}")))?;
                file_bytes = Some(data.to_vec());
            }
            Some("path") => {
                category = Some(
                    field
                        .text()
                        .await
                        .map_err(|e| AppError::BadRequest(format!("Path tidak valid: {e}")))?,
                );
            }
            _ => {}
        }
    }

    let bytes = file_bytes.ok_or_else(|| AppError::BadRequest("File tidak ditemukan".into()))?;

    if !ALLOWED_MIME.contains(&content_type.as_str()) {
        return Err(AppError::BadRequest(
            "File tidak valid. Hanya menerima gambar (jpeg, jpg, png, gif, webp)".into(),
        ));
    }
    if bytes.len() > MAX_SIZE {
        return Err(AppError::BadRequest("Ukuran file melebihi 10MB".into()));
    }

    let category = normalize_category(category)?;
    let filename = format!(
        "{}-{}{}",
        chrono::Utc::now().timestamp_millis(),
        Uuid::new_v4().simple(),
        ext_for(&file_name, &content_type)
    );
    let key = match &category {
        Some(c) => format!("{c}/{filename}"),
        None => filename.clone(),
    };

    let bucket = build_bucket()?;
    let size = bytes.len();
    let response = bucket
        .put_object_with_content_type(&key, &bytes, &content_type)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Gagal upload ke S3: {e}")))?;

    if response.status_code() >= 300 {
        return Err(AppError::Internal(anyhow::anyhow!(
            "Upload S3 gagal dengan status {}",
            response.status_code()
        )));
    }

    Ok(Json(UploadResponse {
        url: build_public_url(&key)?,
        key,
        filename,
        category,
        mimetype: content_type,
        size,
    }))
}
