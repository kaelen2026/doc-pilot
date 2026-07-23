package dev.w3ctech.docpilot.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

private val Paper = Color(0xFFF6F0E4)
private val Ink = Color(0xFF252019)
private val Seal = Color(0xFFB43B32)

@Composable
fun DocPilotTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
  MaterialTheme(
    colorScheme = if (dark) darkColorScheme(
      primary = Color(0xFFFFB4AA), background = Color(0xFF1D1B18), surface = Color(0xFF26221D),
    ) else lightColorScheme(
      primary = Seal, onPrimary = Color.White, background = Paper, onBackground = Ink,
      surface = Color(0xFFFFF9EF), onSurface = Ink, secondary = Color(0xFF6F5B4C),
    ),
    content = content,
  )
}
