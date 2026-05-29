use crate::{AppError, Result};
use lettre::{
    message::Mailbox,
    transport::smtp::authentication::Credentials,
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
};

#[derive(Clone)]
pub struct EmailSender {
    mode: EmailMode,
}

#[derive(Clone)]
enum EmailMode {
    LogOnly,
    Smtp {
        from: Mailbox,
        transport: AsyncSmtpTransport<Tokio1Executor>,
    },
}

impl EmailSender {
    pub fn from_env() -> Result<Self> {
        let smtp_host = std::env::var("SMTP_HOST").ok();
        if smtp_host.as_deref().unwrap_or("").trim().is_empty() {
            return Ok(Self {
                mode: EmailMode::LogOnly,
            });
        }

        let smtp_host = smtp_host.unwrap();
        let smtp_user = std::env::var("SMTP_USERNAME")
            .map_err(|_| AppError::BadRequest("SMTP_USERNAME must be set when SMTP_HOST is set".into()))?;
        let smtp_pass = std::env::var("SMTP_PASSWORD")
            .map_err(|_| AppError::BadRequest("SMTP_PASSWORD must be set when SMTP_HOST is set".into()))?;
        let smtp_from = std::env::var("SMTP_FROM")
            .map_err(|_| AppError::BadRequest("SMTP_FROM must be set when SMTP_HOST is set".into()))?;

        let from: Mailbox = smtp_from
            .parse()
            .map_err(|e| AppError::BadRequest(format!("Invalid SMTP_FROM: {e}")))?;

        let creds = Credentials::new(smtp_user, smtp_pass);
        let transport = AsyncSmtpTransport::<Tokio1Executor>::relay(&smtp_host)
            .map_err(|e| AppError::BadRequest(format!("Invalid SMTP_HOST: {e}")))?
            .credentials(creds)
            .build();

        Ok(Self {
            mode: EmailMode::Smtp { from, transport },
        })
    }

    pub async fn send_password_reset(&self, to_email: &str, reset_link: &str) -> Result<()> {
        match &self.mode {
            EmailMode::LogOnly => {
                tracing::info!("Password reset requested for {} => {}", to_email, reset_link);
                Ok(())
            }
            EmailMode::Smtp { from, transport } => {
                let to: Mailbox = to_email
                    .parse()
                    .map_err(|e| AppError::BadRequest(format!("Invalid email: {e}")))?;

                let email = Message::builder()
                    .from(from.clone())
                    .to(to)
                    .subject("Sportiva - Password Reset")
                    .body(format!(
                        "Use this link to reset your password (expires soon):\n\n{}\n",
                        reset_link
                    ))
                    .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;

                transport
                    .send(email)
                    .await
                    .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;
                Ok(())
            }
        }
    }
}

