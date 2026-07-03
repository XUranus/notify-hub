package com.notifyhub.client.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import com.notifyhub.client.data.ConfigStore

// ── Color Palettes ──
data class AppPalette(
    val primary: Color,
    val onPrimary: Color,
    val primaryContainer: Color,
    val onPrimaryContainer: Color,
)

val palettes = listOf(
    "Indigo" to AppPalette(Color(0xFF4F46E5), Color.White, Color(0xFFEEF2FF), Color(0xFF312E81)),
    "Blue" to AppPalette(Color(0xFF2563EB), Color.White, Color(0xFFDBEAFE), Color(0xFF1E3A5F)),
    "Teal" to AppPalette(Color(0xFF0D9488), Color.White, Color(0xFFCCFBF1), Color(0xFF134E4A)),
    "Green" to AppPalette(Color(0xFF16A34A), Color.White, Color(0xFFDCFCE7), Color(0xFF14532D)),
    "Orange" to AppPalette(Color(0xFFF97316), Color.White, Color(0xFFFED7AA), Color(0xFF7C2D12)),
    "Red" to AppPalette(Color(0xFFDC2626), Color.White, Color(0xFFFEE2E2), Color(0xFF7F1D1D)),
    "Purple" to AppPalette(Color(0xFF9333EA), Color.White, Color(0xFFF3E8FF), Color(0xFF581C87)),
)

private fun buildLightScheme(p: AppPalette) = lightColorScheme(
    primary = p.primary,
    onPrimary = p.onPrimary,
    primaryContainer = p.primaryContainer,
    onPrimaryContainer = p.onPrimaryContainer,
    background = Color(0xFFF5F5F5),
    surface = Color.White,
    surfaceVariant = Color(0xFFF3F4F6),
    onSurfaceVariant = Color(0xFF6B7280),
    error = Color(0xFFDC2626),
    errorContainer = Color(0xFFFEF2F2),
)

private fun buildDarkScheme(p: AppPalette) = darkColorScheme(
    primary = p.primary.copy(alpha = 0.8f),
    onPrimary = p.onPrimary,
    primaryContainer = p.onPrimaryContainer,
    onPrimaryContainer = p.primaryContainer,
    background = Color(0xFF111318),
    surface = Color(0xFF1A1D24),
    surfaceVariant = Color(0xFF22252E),
    onSurfaceVariant = Color(0xFF9CA3AF),
    error = Color(0xFFF87171),
    errorContainer = Color(0xFF450A0A),
)

@Composable
fun NotifyHubTheme(content: @Composable () -> Unit) {
    val context = LocalContext.current
    val themeMode = ConfigStore.getThemeMode(context)  // 0=system, 1=light, 2=dark
    val colorIdx = ConfigStore.getColorScheme(context)

    val darkTheme = when (themeMode) {
        1 -> false
        2 -> true
        else -> isSystemInDarkTheme()
    }

    val palette = palettes.getOrNull(colorIdx)?.second ?: palettes[0].second

    val colorScheme = when {
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && colorIdx == 0 -> {
            if (darkTheme) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        }
        darkTheme -> buildDarkScheme(palette)
        else -> buildLightScheme(palette)
    }

    MaterialTheme(
        colorScheme = colorScheme,
        content = content
    )
}
