use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Instant;

struct LoginAttempt {
    failures: u32,
    locked_until: Option<Instant>,
}

static ATTEMPTS: Mutex<Option<HashMap<String, LoginAttempt>>> = Mutex::new(None);

fn get_attempts() -> std::sync::MutexGuard<'static, Option<HashMap<String, LoginAttempt>>> {
    let mut guard = ATTEMPTS.lock().unwrap();
    if guard.is_none() {
        *guard = Some(HashMap::new());
    }
    guard
}

/// Lockout tiers: (failure count threshold, lockout duration in seconds)
const LOCKOUT_TIERS: &[(u32, u64)] = &[
    (3, 300),     // after 3 failures: 5 min lockout
    (6, 3600),    // after 6 failures: 1 hour lockout
    (9, 43200),   // after 9 failures: 12 hour lockout
    (12, 86400),  // after 12 failures: 24 hour lockout
];

/// Check if login is allowed for the given email.
/// Returns Ok(()) if allowed, Err((message, remaining_seconds)) if locked out.
pub fn check_login_allowed(email: &str) -> Result<(), (String, i64)> {
    let mut guard = get_attempts();
    let attempts = guard.as_mut().unwrap();
    let key = email.to_lowercase();

    if let Some(entry) = attempts.get(&key) {
        if let Some(locked_until) = entry.locked_until {
            if Instant::now() < locked_until {
                let remaining = locked_until.duration_since(Instant::now()).as_secs() as i64;
                return Err((
                    format!("account locked, try again in {} seconds", remaining),
                    remaining,
                ));
            }
        }
    }

    Ok(())
}

/// Record a failed login attempt. Applies lockout if threshold is reached.
pub fn record_failure(email: &str) {
    let mut guard = get_attempts();
    let attempts = guard.as_mut().unwrap();
    let key = email.to_lowercase();

    let entry = attempts.entry(key).or_insert(LoginAttempt {
        failures: 0,
        locked_until: None,
    });

    entry.failures += 1;

    // Check if we should apply a lockout
    for &(threshold, duration_secs) in LOCKOUT_TIERS.iter().rev() {
        if entry.failures >= threshold {
            entry.locked_until = Some(Instant::now() + std::time::Duration::from_secs(duration_secs));
            break;
        }
    }
}

/// Clear failed login attempts on successful login.
pub fn clear_failures(email: &str) {
    let mut guard = get_attempts();
    let attempts = guard.as_mut().unwrap();
    let key = email.to_lowercase();
    attempts.remove(&key);
}
