use log::{debug, error, warn};
use notify_rust::Notification;
#[cfg(target_os = "linux")]
use notify_rust::Image as NotifImage;
use std::path::PathBuf;

/// Cache dir for decoded topic icons.
fn icon_cache_dir() -> PathBuf {
    let dir = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("notifyhub-client")
        .join("icons");
    std::fs::create_dir_all(&dir).ok();
    dir
}

/// Find the app icon in standard Linux locations or relative to the executable.
fn find_app_icon() -> Option<PathBuf> {
    debug!("[notify] Looking for app icon");
    let candidates = [
        "/usr/share/icons/hicolor/128x128/apps/com.notifyhub.client.png",
        "/usr/share/pixmaps/notifyhub-client.png",
    ];
    for path in &candidates {
        if std::path::Path::new(path).exists() {
            debug!("[notify] Found app icon at {}", path);
            return Some(PathBuf::from(path));
        }
    }
    // Fallback: look for icons/128x128.png relative to the executable
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            // Try multiple relative paths to cover different layouts:
            //   exe_dir/../icons/     → installed: bin/../icons/
            //   exe_dir/../../icons/  → cargo run: target/debug/../../icons/ = desktop/icons/
            for rel in ["../icons/128x128.png", "../../icons/128x128.png"] {
                let candidate = exe_dir.join(rel);
                if candidate.exists() {
                    debug!("[notify] Found app icon at {}", candidate.display());
                    return Some(candidate);
                }
            }
        }
    }
    debug!("[notify] App icon not found");
    None
}

/// Decode a base64 topic icon (with optional data URI prefix) and save to cache.
/// Returns the file path if successful.
pub fn decode_topic_icon(icon_b64: &str) -> Option<PathBuf> {
    debug!("[notify] Decoding topic icon");
    use base64::Engine;
    let engine = base64::engine::general_purpose::STANDARD;
    // Strip data URI prefix if present (e.g. "data:image/png;base64,...")
    let raw = if let Some(idx) = icon_b64.find(",") {
        let prefix = &icon_b64[..idx];
        if prefix.contains("base64") { &icon_b64[idx + 1..] } else { icon_b64 }
    } else {
        icon_b64
    };
    let bytes = match engine.decode(raw) {
        Ok(b) => b,
        Err(e) => {
            debug!("[notify] Base64 decode failed: {}", e);
            return None;
        }
    };
    if bytes.is_empty() {
        return None;
    }
    let hash = {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        let mut h = DefaultHasher::new();
        icon_b64.hash(&mut h);
        h.finish()
    };
    let path = icon_cache_dir().join(format!("{:x}.png", hash));
    if !path.exists() {
        if let Err(e) = std::fs::write(&path, &bytes) {
            warn!("[notify] Failed to cache icon: {}", e);
            return None;
        }
    }
    Some(path)
}

/// Convert markdown to plain text for system notifications.
/// Handles tables, bold, italic, code, links, headers, lists.
fn markdown_to_plain(input: &str) -> String {
    // Strip HTML tags first
    let mut stripped = String::with_capacity(input.len());
    let mut inside_tag = false;
    for ch in input.chars() {
        match ch {
            '<' => inside_tag = true,
            '>' => inside_tag = false,
            _ if !inside_tag => stripped.push(ch),
            _ => {}
        }
    }
    let input = stripped.trim();

    let mut result = String::with_capacity(input.len());
    let lines: Vec<&str> = input.lines().collect();
    let mut i = 0;

    while i < lines.len() {
        let line = lines[i];

        // Skip table separator lines (|---|---|)
        if line.trim_start().starts_with("|") {
            // Collect all table rows
            let mut table_rows: Vec<Vec<String>> = Vec::new();
            while i < lines.len() && lines[i].trim_start().starts_with("|") {
                let row = lines[i];
                // Skip separator rows
                if row.chars().all(|c| c == '|' || c == '-' || c == ' ' || c == ':') {
                    i += 1;
                    continue;
                }
                let cells: Vec<String> = row
                    .split('|')
                    .map(|c| {
                        let s = c.trim();
                        // Strip markdown formatting from cells
                        strip_md_formatting(s)
                    })
                    .filter(|s| !s.is_empty())
                    .collect();
                if !cells.is_empty() {
                    table_rows.push(cells);
                }
                i += 1;
            }

            // Render table as aligned text
            if !table_rows.is_empty() {
                let num_cols = table_rows.iter().map(|r| r.len()).max().unwrap_or(0);
                if num_cols > 0 {
                    // Calculate column widths
                    let mut widths = vec![0usize; num_cols];
                    for row in &table_rows {
                        for (j, cell) in row.iter().enumerate() {
                            if j < num_cols {
                                widths[j] = widths[j].max(cell.len());
                            }
                        }
                    }

                    for (row_idx, row) in table_rows.iter().enumerate() {
                        let mut parts: Vec<String> = Vec::new();
                        for j in 0..num_cols {
                            let cell = row.get(j).map(|s| s.as_str()).unwrap_or("");
                            parts.push(format!("{:<width$}", cell, width = widths[j]));
                        }
                        result.push_str(&parts.join("  "));
                        // Add separator after first row (header)
                        if row_idx == 0 {
                            result.push('\n');
                            let sep_parts: Vec<String> = widths.iter().map(|w| "-".repeat(*w)).collect();
                            result.push_str(&sep_parts.join("  "));
                        }
                        result.push('\n');
                    }
                }
            }
            continue;
        }

        // Headers: ### text → text
        if line.trim_start().starts_with("#") {
            let trimmed = line.trim_start();
            let level = trimmed.chars().take_while(|&c| c == '#').count();
            let text = trimmed[level..].trim();
            result.push_str(&strip_md_formatting(text));
            result.push('\n');
            i += 1;
            continue;
        }

        // Unordered list items: - text or * text
        let trimmed = line.trim_start();
        if (trimmed.starts_with("- ") || trimmed.starts_with("* ")) && !trimmed.starts_with("---") {
            let indent = line.len() - line.trim_start().len();
            let prefix = "  ".repeat(indent / 2);
            result.push_str(&format!("{}• {}", prefix, strip_md_formatting(&trimmed[2..])));
            result.push('\n');
            i += 1;
            continue;
        }

        // Ordered list: 1. text
        if let Some(pos) = trimmed.find(". ") {
            if trimmed[..pos].chars().all(|c| c.is_ascii_digit()) {
                let indent = line.len() - line.trim_start().len();
                let prefix = "  ".repeat(indent / 2);
                result.push_str(&format!("{}{}.", prefix, &trimmed[..pos]));
                result.push_str(&strip_md_formatting(&trimmed[pos + 2..]));
                result.push('\n');
                i += 1;
                continue;
            }
        }

        // Regular line — strip markdown formatting
        result.push_str(&strip_md_formatting(line));
        result.push('\n');
        i += 1;
    }

    result.trim().to_string()
}

/// Strip inline markdown formatting (bold, italic, code, links, etc.)
fn strip_md_formatting(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let chars: Vec<char> = s.chars().collect();
    let len = chars.len();
    let mut i = 0;

    while i < len {
        // Inline code: `code`
        if chars[i] == '`' {
            i += 1;
            let start = i;
            while i < len && chars[i] != '`' {
                i += 1;
            }
            result.push_str(&s[start..i]);
            if i < len { i += 1; } // skip closing `
            continue;
        }

        // Bold+italic: ***text*** or ___text___
        if i + 2 < len && ((chars[i] == '*' && chars[i+1] == '*' && chars[i+2] == '*')
            || (chars[i] == '_' && chars[i+1] == '_' && chars[i+2] == '_')) {
            let marker = s[i..i+3].to_string();
            i += 3;
            let start = i;
            while i + 2 < len && &s[i..i+3] != marker { i += 1; }
            result.push_str(&s[start..i]);
            i += 3; // skip closing marker
            continue;
        }

        // Bold: **text** or __text__
        if i + 1 < len && ((chars[i] == '*' && chars[i+1] == '*')
            || (chars[i] == '_' && chars[i+1] == '_')) {
            let marker = s[i..i+2].to_string();
            i += 2;
            let start = i;
            while i + 1 < len && &s[i..i+2] != marker { i += 1; }
            result.push_str(&s[start..i]);
            i += 2;
            continue;
        }

        // Italic: *text* or _text_
        if chars[i] == '*' || (chars[i] == '_' && i > 0 && !chars[i-1].is_alphanumeric()
            && i + 1 < len && chars[i+1] != ' ') {
            let ch = chars[i];
            i += 1;
            let start = i;
            while i < len && chars[i] != ch { i += 1; }
            result.push_str(&s[start..i]);
            if i < len { i += 1; }
            continue;
        }

        // Link: [text](url) → text
        if chars[i] == '[' {
            i += 1;
            let start = i;
            while i < len && chars[i] != ']' { i += 1; }
            result.push_str(&s[start..i]);
            if i < len { i += 1; } // skip ]
            if i < len && chars[i] == '(' {
                i += 1;
                while i < len && chars[i] != ')' { i += 1; }
                if i < len { i += 1; } // skip )
            }
            continue;
        }

        // Header marker: #
        if chars[i] == '#' && (i == 0 || chars[i-1] == '\n') {
            i += 1;
            while i < len && chars[i] == '#' { i += 1; }
            if i < len && chars[i] == ' ' { i += 1; }
            continue;
        }

        result.push(chars[i]);
        i += 1;
    }

    result
}

pub fn show_notification(title: &str, body: &str) {
    debug!("[notify] Showing notification: {}", title);
    show_notification_with_icon(title, body, None);
}

pub fn show_notification_with_icon(title: &str, body: &str, content_icon_path: Option<&str>) {
    debug!("[notify] Showing notification with icon: {}", title);
    let plain_body = markdown_to_plain(body);
    let mut notif = Notification::new();
    notif
        .summary(title)
        .body(&plain_body)
        .appname("NotifyHub")
        .timeout(10000);

    // App icon (top-left corner) — always the product logo
    // D-Bus spec requires file:// URI or theme icon name
    if let Some(path) = find_app_icon() {
        notif.icon(&format!("file://{}", path.to_string_lossy()));
    } else {
        notif.icon("dialog-information");
    }

    // Content image — topic icon when available, otherwise app icon
    // KDE Plasma only renders the content image area; without it, the notification
    // appears to have no icon even when `icon` is set.
    #[cfg(target_os = "linux")]
    {
        if let Some(path) = content_icon_path {
            notif.image_path(&format!("file://{}", path));
        } else if let Some(app_icon_path) = find_app_icon() {
            match NotifImage::open(&app_icon_path) {
                Ok(img) => { notif.image_data(img); }
                Err(e) => debug!("[notify] Failed to open icon image: {}", e),
            }
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = content_icon_path;
    }

    if let Err(e) = notif.show() {
        error!("[notify] Failed to show notification: {}", e);
    }
}
