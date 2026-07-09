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
    val secondary: Color,
    val secondaryContainer: Color,
    val tertiary: Color,
    val tertiaryContainer: Color,
)

val palettes = listOf(
    "Indigo" to AppPalette(
        Color(0xFF4F46E5), Color.White, Color(0xFFEEF2FF), Color(0xFF312E81),
        Color(0xFF6366F1), Color(0xFFE0E7FF), Color(0xFF8B5CF6), Color(0xFFEDE9FE)
    ),
    "Blue" to AppPalette(
        Color(0xFF2563EB), Color.White, Color(0xFFDBEAFE), Color(0xFF1E3A5F),
        Color(0xFF3B82F6), Color(0xFFBFDBFE), Color(0xFF0EA5E9), Color(0xFFE0F2FE)
    ),
    "Teal" to AppPalette(
        Color(0xFF0D9488), Color.White, Color(0xFFCCFBF1), Color(0xFF134E4A),
        Color(0xFF14B8A6), Color(0xFF99F6E4), Color(0xFF06B6D4), Color(0xFFCFFAFE)
    ),
    "Green" to AppPalette(
        Color(0xFF16A34A), Color.White, Color(0xFFDCFCE7), Color(0xFF14532D),
        Color(0xFF22C55E), Color(0xFFBBF7D0), Color(0xFF84CC16), Color(0xFFECFCCB)
    ),
    "Orange" to AppPalette(
        Color(0xFFF97316), Color.White, Color(0xFFFED7AA), Color(0xFF7C2D12),
        Color(0xFFFB923C), Color(0xFFFED7AA), Color(0xFFF59E0B), Color(0xFFFEF3C7)
    ),
    "Red" to AppPalette(
        Color(0xFFDC2626), Color.White, Color(0xFFFEE2E2), Color(0xFF7F1D1D),
        Color(0xFFEF4444), Color(0xFFFECACA), Color(0xFFF43F5E), Color(0xFFFFE4E6)
    ),
    "Purple" to AppPalette(
        Color(0xFF9333EA), Color.White, Color(0xFFF3E8FF), Color(0xFF581C87),
        Color(0xFFA855F7), Color(0xFFE9D5FF), Color(0xFFD946EF), Color(0xFFF5D0FE)
    ),
)

private val lightBg = Color(0xFFF5F5F5)
private val darkBg = Color(0xFF111318)

private fun buildLightScheme(p: AppPalette) = lightColorScheme(
    primary = p.primary,
    onPrimary = p.onPrimary,
    primaryContainer = p.primaryContainer,
    onPrimaryContainer = p.onPrimaryContainer,
    secondary = p.secondary,
    secondaryContainer = p.secondaryContainer,
    tertiary = p.tertiary,
    tertiaryContainer = p.tertiaryContainer,
    background = lightBg,
    surface = lightBg,
    surfaceVariant = Color(0xFFE8E8E8),
    onSurfaceVariant = Color(0xFF6B7280),
    error = Color(0xFFDC2626),
    errorContainer = Color(0xFFFEF2F2),
)

private fun buildDarkScheme(p: AppPalette) = darkColorScheme(
    primary = p.primary.copy(alpha = 0.8f),
    onPrimary = p.onPrimary,
    primaryContainer = p.onPrimaryContainer,
    onPrimaryContainer = p.primaryContainer,
    secondary = p.secondary.copy(alpha = 0.8f),
    secondaryContainer = p.secondaryContainer,
    tertiary = p.tertiary.copy(alpha = 0.8f),
    tertiaryContainer = p.tertiaryContainer,
    background = darkBg,
    surface = darkBg,
    surfaceVariant = Color(0xFF282B33),
    onSurfaceVariant = Color(0xFFB0B8C4),
    onSurface = Color(0xFFE8EAF0),
    error = Color(0xFFF87171),
    errorContainer = Color(0xFF450A0A),
)

@Composable
fun NotifyHubTheme(content: @Composable () -> Unit) {
    val context = LocalContext.current
    // Read observable state so recomposition triggers on change
    val themeMode = ConfigStore.themeMode
    val colorIdx = ConfigStore.colorSchemeIdx

    val darkTheme = when (themeMode) {
        1 -> false
        2 -> true
        else -> isSystemInDarkTheme()
    }

    val palette = palettes.getOrNull(colorIdx)?.second ?: palettes[0].second

    val colorScheme = when {
        darkTheme -> buildDarkScheme(palette)
        else -> buildLightScheme(palette)
    }

    MaterialTheme(
        colorScheme = colorScheme,
        content = content
    )
}
