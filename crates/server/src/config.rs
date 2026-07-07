use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub database_url: PathBuf,
    pub jwt_secret: String,
    pub data_dir: PathBuf,
    pub upload_dir: PathBuf,
    pub fcm_service_account_path: Option<String>,
    pub fcm_service_account_json: Option<String>,
    pub cors_origin: Option<String>,
}

impl Config {
    pub fn from_env() -> Self {
        dotenvy::dotenv().ok();

        let host = std::env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
        let port: u16 = std::env::var("PORT")
            .unwrap_or_else(|_| "3000".to_string())
            .parse()
            .expect("PORT must be a number");

        let data_dir = std::env::var("DATA_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| PathBuf::from("data"));

        let database_url = std::env::var("DATABASE_URL")
            .map(PathBuf::from)
            .unwrap_or_else(|_| data_dir.join("notifyhub.db"));

        let upload_dir = data_dir.join("uploads");

        // Dev convenience: a random secret is generated so developers can run without
        // configuring JWT_SECRET. Tokens will be invalidated on restart.
        let jwt_secret = std::env::var("JWT_SECRET").unwrap_or_else(|_| {
            use rand::Rng;
            let mut rng = rand::thread_rng();
            let secret: String = (0..32).map(|_| rng.gen_range(b'a'..=b'z') as char).collect();
            tracing::warn!("JWT_SECRET not set, using random secret (will change on restart!)");
            secret
        });

        let fcm_service_account_path =
            std::env::var("FCM_SERVICE_ACCOUNT_PATH").ok();
        let fcm_service_account_json =
            std::env::var("FCM_SERVICE_ACCOUNT_JSON").ok();
        let cors_origin = std::env::var("CORS_ORIGIN").ok();

        Config {
            host,
            port,
            database_url,
            jwt_secret,
            data_dir,
            upload_dir,
            fcm_service_account_path,
            fcm_service_account_json,
            cors_origin,
        }
    }

    pub fn bind_addr(&self) -> String {
        format!("{}:{}", self.host, self.port)
    }
}
