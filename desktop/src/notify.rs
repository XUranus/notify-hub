use notify_rust::Notification;

/// Strip HTML tags for plain-text display in notifications.
fn strip_html(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut inside_tag = false;
    for ch in input.chars() {
        match ch {
            '<' => inside_tag = true,
            '>' => inside_tag = false,
            _ if !inside_tag => result.push(ch),
            _ => {}
        }
    }
    result.trim().to_string()
}

pub fn show_notification(title: &str, body: &str) {
    let plain_body = strip_html(body);
    let _ = Notification::new()
        .summary(title)
        .body(&plain_body)
        .appname("NotifyHub")
        .icon("dialog-information")
        .timeout(10000)
        .show();
}
